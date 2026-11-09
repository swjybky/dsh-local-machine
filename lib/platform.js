/**
 * Cross-platform metric collection for the Local machine panel.
 *
 * Linux reads procfs and sysfs, macOS uses `vm_stat`, `sysctl`, `ioreg`, and
 * `netstat`, and Windows uses Node's `os` module plus CIM queries through
 * PowerShell. Every probe is best-effort: absence of a tool or a counter only
 * removes that value from the snapshot, it never fails the request.
 */

import { execFile } from 'node:child_process'
import { readFile, readdir, statfs } from 'node:fs/promises'
import {
  arch as osArch,
  cpus,
  freemem,
  hostname as osHostname,
  loadavg,
  networkInterfaces,
  release as osRelease,
  totalmem,
  uptime as osUptime,
} from 'node:os'

import {
  aggregateCpuTimes,
  busyPercent,
  parseAmdClocks,
  parseDiskstats,
  parseDf,
  parseIfconfigMedia,
  parseIoregBlockStorage,
  parseIoregGpu,
  parseJsonValue,
  parseLoadThreads,
  parseMounts,
  parseNetDev,
  parseNetstatIb,
  parseNvidiaComputeApps,
  parseNvidiaProcInformation,
  parseNvidiaProcVersion,
  parseNvidiaSmi,
  parseNvidiaSmiHeader,
  parseOsRelease,
  parsePageFileUsage,
  parseProcMeminfo,
  parseProcStatLines,
  parsePsProcesses,
  parseSwVers,
  parseSystemProfilerMemory,
  parseVideoControllers,
  parseVmStat,
  parseSwapusage,
  perCoreBusyPercents,
  perCoreCpuTimes,
  parseWindowsCpuInfo,
  parseWindowsDisks,
  parseWindowsFans,
  parseWindowsMemoryModules,
  parseWindowsNetwork,
  parseWindowsOsInfo,
  parseWindowsPerfNetwork,
  parseWindowsProcesses,
  parseWindowsThermalZones,
  selectFanReading,
  selectTemperatureSensors,
  selectVideoController,
} from './parsers.js'

export * from './parsers.js'

/** Below this gap two CPU samples share too much idle time to be meaningful. */
const CPU_MIN_WINDOW_MS = 200
/** A sample older than this is too stale to average against a fresh one. */
const CPU_MAX_REUSE_MS = 5000
/** Hard limit for one native probe; a missing tool must not hold the request open. */
const PROBE_TIMEOUT_MS = 1500
/** PowerShell start-up is slower than a native probe. */
const POWERSHELL_TIMEOUT_MS = 4000
/** One GPU probe per window; repeated refreshes reuse it. */
const GPU_CACHE_MS = 5000
/** Page-file usage barely moves; avoid a PowerShell spawn on every refresh. */
const SWAP_CACHE_MS = 5000
/** Two rate samples are at least this far apart. */
const RATE_MIN_WINDOW_MS = 250
/** A rate sample older than this is replaced instead of compared. */
const RATE_MAX_AGE_MS = 30000
/** Thermal and fan counters change slowly. */
const SENSOR_CACHE_MS = 1500
/** Keep process probes off the two-second refresh path. */
const PROCESS_CACHE_MS = 900
/** Windows disk usage needs one PowerShell spawn. */
const WINDOWS_DISK_CACHE_MS = 5000
/** Default cap for command output; bigger results are treated as a failed probe. */
const DEFAULT_MAX_BUFFER = 256 * 1024
/** `ioreg` prints every accelerator property, which easily exceeds 256 KiB. */
const IOREG_MAX_BUFFER = 2 * 1024 * 1024

/** Previous CPU sample and the shared in-flight CPU measurement. */
let previousCpu = null
let pendingCpu = null
/** CPU model name never changes while the process runs. */
let cpuModel
/** Last GPU probe and its timestamp. */
let gpuCache = { platform: null, at: 0, value: null }
/** Last Windows page-file probe; `undefined` means "not probed yet". */
let swapCache = { platform: null, at: 0, value: undefined }
/** The most recent GPU snapshot, used to avoid NVIDIA process probes on non-NVIDIA hosts. */
let lastGpu = null

/** Vendor labels used when only a PCI id or driver name is known. */
const VENDOR_LABELS = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', apple: 'Apple' }

/** Commands this collector spawns; the process table should not list itself. */
const PROBE_PROCESS_NAMES = new Set([
  'ps', 'nvidia-smi', 'vm_stat', 'system_profiler', 'ioreg', 'netstat',
  'df', 'mount', 'sysctl', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'conhost',
])

/**
 * Build a platform-aware TTL cache around one async loader.
 * @param ttlMs - Maximum age of a cached value.
 * @returns A zero-argument async getter.
 */
function createCache(ttlMs) {
  let state = {
    platform: null,
    at: 0,
    value: null,
    pending: null,
    pendingPlatform: null,
  }
  return async function cached(loader) {
    const platform = process.platform
    if (state.platform === platform && Date.now() - state.at < ttlMs) return state.value
    if (state.pending !== null && state.pendingPlatform === platform) return state.pending
    const promise = Promise.resolve().then(loader).then((value) => {
      state = { platform, at: Date.now(), value, pending: null, pendingPlatform: null }
      return value
    }, (error) => {
      state = { ...state, pending: null, pendingPlatform: null }
      throw error
    })
    state = { ...state, pending: promise, pendingPlatform: platform }
    return promise
  }
}

/** Static operating-system identity; it only changes when the machine reboots. */
const cachedOsStatic = createCache(60_000)
/** Windows CIM identity: OS build, CPU, memory modules, and video controllers. */
const cachedWindowsStatic = createCache(60_000)
/** Windows page-file usage. */
const cachedWindowsDisks = createCache(WINDOWS_DISK_CACHE_MS)
/** GPU description. */
const cachedGpu = createCache(GPU_CACHE_MS)
/** Thermal/fan block. */
const cachedSensors = createCache(SENSOR_CACHE_MS)
/** CPU topology never changes while the process runs. */
const cachedCpuTopology = createCache(60_000)
/** Process block. */
const cachedProcesses = createCache(PROCESS_CACHE_MS)
/** NVIDIA per-process VRAM. */
const cachedNvidiaApps = createCache(5000)
/** macOS memory-slot description from `system_profiler`. */
const cachedDarwinMemorySpec = createCache(60_000)

/** Linux disk-I/O rate state. */
const linuxDiskRate = { value: null, pending: null, platform: null }
/** macOS disk-I/O rate state. */
const darwinDiskRate = { value: null, pending: null, platform: null }
/** Linux network-rate state. */
const linuxNetworkRate = { value: null, pending: null, platform: null }
/** macOS network-rate state. */
const darwinNetworkRate = { value: null, pending: null, platform: null }
/** Windows network-rate state (one cumulative sample per refresh). */
const windowsNetworkRate = { value: null, pending: null, platform: null }

/**
 * Read every metric once, concurrently where possible.
 * @returns The snapshot payload consumed by the panel.
 */
export async function readSnapshot() {
  const [os, cpu, memory, gpu, disks, diskIO, network, sensorBlock, processes] = await Promise.all([
    safe(readOs, null),
    safe(readCpu, null),
    safe(readMemory, null),
    safe(readGpu, null),
    safe(readDisks, []),
    safe(readDiskIo, null),
    safe(readNetwork, null),
    safe(readSensors, { temperatures: [], fan: null }),
    safe(readProcesses, null),
  ])
  const temperatures = mergeGpuTemperature(sensorBlock?.temperatures ?? [], gpu)
  return {
    schemaVersion: 2,
    sampledAt: new Date().toISOString(),
    platform: process.platform,
    os,
    cpu,
    memory,
    gpu,
    disks,
    diskIO,
    network,
    sensors: temperatures,
    fan: sensorBlock?.fan ?? null,
    processes,
  }
}

/**
 * Run one probe and substitute a fallback when it throws.
 * @param probe - Async probe.
 * @param fallback - Value used on failure.
 * @returns The probe result or the fallback.
 */
function safe(probe, fallback) {
  return probe().catch(() => fallback)
}

/**
 * Read the operating-system identity and uptime.
 * @returns OS block.
 */
async function readOs() {
  const info = await cachedOsStatic(readOsStatic).catch(() => null)
  const up = osUptime()
  return {
    name: info?.name ?? platformName(),
    release: info?.release ?? null,
    kernel: info?.kernel ?? null,
    version: info?.version ?? null,
    hostname: osHostname(),
    arch: mapArch(osArch()),
    desktop: info?.desktop ?? null,
    uptimeSeconds: Number.isFinite(up) ? up : null,
    bootTime: Number.isFinite(up) ? new Date(Date.now() - up * 1000).toISOString() : null,
  }
}

/**
 * Read the static part of the OS identity.
 * @returns Name, release, kernel/version, and desktop/shell.
 */
async function readOsStatic() {
  if (process.platform === 'linux') {
    const text = await readTextFile('/etc/os-release')
    const parsed = text === null ? null : parseOsRelease(text)
    return {
      name: 'Linux',
      release: parsed?.release ?? null,
      kernel: osRelease(),
      version: null,
      desktop: detectLinuxDesktop(),
    }
  }
  if (process.platform === 'darwin') {
    const text = await execText('/usr/bin/sw_vers', [], PROBE_TIMEOUT_MS)
    const parsed = text === null ? null : parseSwVers(text)
    return {
      name: 'macOS',
      release: parsed?.release ?? null,
      kernel: `Darwin ${osRelease()}`,
      version: parsed?.version ?? null,
      desktop: 'Aqua',
    }
  }
  if (process.platform === 'win32') {
    const info = await cachedWindowsStatic(readWindowsStatic).catch(() => null)
    return {
      name: 'Windows',
      release: info?.os?.release ?? `Windows ${osRelease()}`,
      kernel: info?.os?.version ?? osRelease(),
      version: info?.os?.version ?? osRelease(),
      desktop: 'Explorer',
    }
  }
  return {
    name: platformName(),
    release: null,
    kernel: osRelease(),
    version: null,
    desktop: null,
  }
}

/**
 * Read the Windows CIM identity block.
 * @returns Parsed OS, CPU, memory, and video-controller entries.
 */
async function readWindowsStatic() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$ErrorActionPreference = "SilentlyContinue"; '
      + '$os = Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber; '
      + '$cpu = Get-CimInstance -ClassName Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,CurrentClockSpeed,MaxClockSpeed; '
      + '$memory = Get-CimInstance -ClassName Win32_PhysicalMemory | Select-Object Capacity,Speed,ConfiguredClockSpeed,SMBIOSMemoryType,MemoryType; '
      + '$gpu = Get-CimInstance -ClassName Win32_VideoController | Select-Object Name,DriverVersion; '
      + '[pscustomobject]@{ os = @($os); cpu = @($cpu); memory = @($memory); gpu = @($gpu) } | ConvertTo-Json -Compress -Depth 4'),
  ], POWERSHELL_TIMEOUT_MS)
  if (text === null) return null
  const parsed = parseJsonValue(text)
  if (parsed === null || typeof parsed !== 'object') return null
  return {
    os: parseWindowsOsInfo(JSON.stringify(parsed.os ?? null)),
    cpu: parseWindowsCpuInfo(JSON.stringify(parsed.cpu ?? null)),
    memory: parseWindowsMemoryModules(JSON.stringify(parsed.memory ?? null)),
    videoControllers: asEntries(parsed.gpu),
  }
}

/**
 * Read the CPU block.
 * @returns Usage, per-core usage, model, frequency, load, and topology.
 */
async function readCpu() {
  const [detail, topology, windows] = await Promise.all([
    measureCpuDetail().catch(() => ({ usage: null, perCore: [] })),
    readCpuTopology().catch(() => null),
    process.platform === 'win32' ? cachedWindowsStatic(readWindowsStatic).catch(() => null) : null,
  ])
  const list = cpus()
  const threads = list.length
  const winCpu = windows?.cpu ?? null
  const [frequencyMhz, baseFrequencyMhz] = await Promise.all([
    readCpuFrequency(winCpu).catch(() => null),
    readCpuBaseFrequency(winCpu).catch(() => null),
  ])
  const load = readLoadAverage()
  const perCore = Array.from({ length: threads }, (_, index) => ({
    index,
    usage: detail.perCore[index] ?? null,
    kind: topology?.kinds?.[index] ?? null,
  }))
  return {
    usage: detail.usage,
    cores: threads,
    threads,
    physicalCores: topology?.physicalCores ?? winCpu?.cores ?? null,
    performanceCores: topology?.performanceCores ?? null,
    efficiencyCores: topology?.efficiencyCores ?? null,
    hybrid: topology?.hybrid === true,
    model: readCpuModel(winCpu),
    frequencyMhz,
    baseFrequencyMhz,
    load: load === null ? null : load[0],
    loadAverage: load,
    perCore,
  }
}

/**
 * Measure aggregate and per-core CPU utilization, sharing one measurement
 * between concurrent callers.
 * @returns Busy percentage plus one value per logical core.
 */
async function measureCpuDetail() {
  if (pendingCpu !== null) return pendingCpu
  pendingCpu = measureCpu().finally(() => {
    pendingCpu = null
  })
  return pendingCpu
}

/**
 * Take the two samples one utilization reading needs, reusing the previous one
 * when it is fresh enough and came from the same source.
 * @returns Aggregate and per-core percentages.
 */
async function measureCpu() {
  const first = await sampleCpu()
  const previous = previousCpu
  const gap = previous === null ? 0 : first.at - previous.at
  const reusable = previous !== null
    && previous.source === first.source
    && gap >= CPU_MIN_WINDOW_MS
    && gap <= CPU_MAX_REUSE_MS
  if (reusable) {
    previousCpu = first
    return {
      usage: busyPercent(previous, first),
      perCore: perCoreBusyPercents(previous.perCore, first.perCore),
    }
  }
  const sameSource = previous !== null && previous.source === first.source
  const wait = sameSource && gap >= 0 && gap < CPU_MIN_WINDOW_MS
    ? CPU_MIN_WINDOW_MS - gap
    : CPU_MIN_WINDOW_MS
  if (wait > 0) await delay(wait)
  const next = await sampleCpu()
  previousCpu = next
  return {
    usage: busyPercent(first, next),
    perCore: perCoreBusyPercents(first.perCore, next.perCore),
  }
}

/**
 * Sample the kernel CPU counters, preferring procfs on Linux.
 * @returns Tick counters, per-core counters, sampling time, and source.
 */
async function sampleCpu() {
  if (process.platform === 'linux') {
    const sample = await readProcStat()
    if (sample !== null) return sample
  }
  const list = cpus()
  const totals = aggregateCpuTimes(list)
  return {
    ...totals,
    perCore: perCoreCpuTimes(list),
    at: Date.now(),
    source: 'os',
  }
}

/**
 * Read the aggregate and per-core lines of `/proc/stat`.
 * @returns Tick counters with their sampling metadata, or null when unreadable.
 */
async function readProcStat() {
  const text = await readFile('/proc/stat', 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = parseProcStatLines(text)
  if (parsed === null || parsed.aggregate === null) return null
  return {
    idle: parsed.aggregate.idle,
    total: parsed.aggregate.total,
    perCore: parsed.cores.map((core) => ({ idle: core.idle, total: core.total })),
    at: Date.now(),
    source: 'proc',
  }
}

/**
 * CPU model name, cached for the process lifetime.
 * @param windowsCpu - Parsed `Win32_Processor` summary when available.
 * @returns Model name or null when the OS does not report one.
 */
function readCpuModel(windowsCpu) {
  const candidate = windowsCpu?.name ?? cpus()[0]?.model
  if (typeof candidate === 'string' && candidate.trim() !== '') {
    cpuModel = candidate.trim()
    return cpuModel
  }
  return cpuModel ?? null
}

/**
 * Average current CPU clock.
 * @param windowsCpu - Parsed `Win32_Processor` summary when available.
 * @returns Megahertz or null.
 */
async function readCpuFrequency(windowsCpu) {
  if (process.platform === 'win32') return windowsCpu?.frequencyMhz ?? null
  if (process.platform === 'darwin') {
    const text = await execText('/usr/sbin/sysctl', ['-n', 'hw.cpufrequency'], PROBE_TIMEOUT_MS)
    const hz = text === null ? null : Number(text.trim())
    return Number.isFinite(hz) && hz > 0 ? Math.round(hz / 1e6) : null
  }
  if (process.platform !== 'linux') return null
  const text = await readTextFile('/proc/cpuinfo')
  if (text !== null) {
    const values = Array.from(text.matchAll(/^cpu MHz\s*:\s*([0-9.]+)/gmu))
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (values.length > 0) {
      return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    }
  }
  const current = await readTextFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq')
  const khz = current === null ? null : Number(current)
  return Number.isFinite(khz) && khz > 0 ? Math.round(khz / 1000) : null
}

/**
 * Read the nominal/base CPU clock where the platform exposes it. The design
 * shows a stable headline clock, so this is preferred over the live average.
 * @param windowsCpu - Parsed `Win32_Processor` summary when available.
 * @returns Megahertz or null.
 */
async function readCpuBaseFrequency(windowsCpu) {
  if (process.platform === 'win32') return windowsCpu?.maxFrequencyMhz ?? null
  if (process.platform === 'linux') {
    const text = await readTextFile('/sys/devices/system/cpu/cpu0/cpufreq/base_frequency')
    const khz = text === null ? null : Number(text)
    return Number.isFinite(khz) && khz > 0 ? Math.round(khz / 1000) : null
  }
  if (process.platform === 'darwin') {
    const text = await execText('/usr/sbin/sysctl', ['-n', 'hw.cpufrequency'], PROBE_TIMEOUT_MS)
    const hz = text === null ? null : Number(text.trim())
    return Number.isFinite(hz) && hz > 0 ? Math.round(hz / 1e6) : null
  }
  return null
}

/**
 * 1/5/15-minute load averages where the platform defines them.
 * Windows returns zeros from `os.loadavg()`, which would be misleading.
 * @returns Load averages or null.
 */
function readLoadAverage() {
  if (process.platform === 'win32') return null
  const values = loadavg()
  if (!Array.isArray(values) || values.length < 3) return null
  return values.slice(0, 3).every((value) => Number.isFinite(value)) ? values.slice(0, 3) : null
}

/**
 * Describe whether the CPU mixes performance and efficiency cores.
 * @returns Topology facts, or null when the platform does not expose them.
 */
async function readCpuTopology() {
  return cachedCpuTopology(probeCpuTopology).catch(() => null)
}

/**
 * Probe the CPU topology without the cache.
 * @returns Topology facts, or null.
 */
async function probeCpuTopology() {
  if (process.platform === 'linux') return await readLinuxCpuTopology()
  if (process.platform === 'darwin') return await readDarwinCpuTopology()
  if (process.platform === 'win32') {
    const info = await cachedWindowsStatic(readWindowsStatic).catch(() => null)
    const threads = cpus().length
    return {
      hybrid: false,
      kinds: Array.from({ length: threads }, () => null),
      physicalCores: info?.cpu?.cores ?? null,
      performanceCores: null,
      efficiencyCores: null,
    }
  }
  return null
}

/**
 * Detect hybrid cores on Linux through SMT sibling counts. A core with an SMT
 * sibling is a performance core; a single-threaded core is an efficiency core.
 * @returns Topology facts, or null without sysfs topology data.
 */
async function readLinuxCpuTopology() {
  const threads = cpus().length
  if (threads === 0) return null
  const entries = await Promise.all(Array.from({ length: threads }, async (_, index) => {
    const base = `/sys/devices/system/cpu/cpu${index}`
    const [siblingsText, coreText, packageText] = await Promise.all([
      readTextFile(`${base}/topology/thread_siblings_list`),
      readTextFile(`${base}/topology/core_id`),
      readTextFile(`${base}/topology/physical_package_id`),
    ])
    const coreId = coreText === null ? null : Number(coreText)
    const packageId = packageText === null ? null : Number(packageText)
    return {
      siblings: siblingsText === null ? null : countCpuList(siblingsText),
      coreKey: Number.isFinite(coreId) && Number.isFinite(packageId) ? `${packageId}:${coreId}` : null,
    }
  }))
  const known = entries.filter((entry) => entry.siblings !== null)
  if (known.length === 0) return null
  const hasMulti = known.some((entry) => entry.siblings > 1)
  const hasSingle = known.some((entry) => entry.siblings === 1)
  const hybrid = hasMulti && hasSingle
  const kinds = entries.map((entry) => {
    if (!hybrid || entry.siblings === null) return null
    return entry.siblings > 1 ? 'p' : 'e'
  })
  const coreKeys = new Set(entries.map((entry) => entry.coreKey).filter((key) => key !== null))
  const physicalCores = coreKeys.size > 0 ? coreKeys.size : null
  let performanceCores = null
  let efficiencyCores = null
  if (hybrid) {
    const performanceKeys = new Set()
    let performanceThreads = 0
    let efficiencyThreads = 0
    entries.forEach((entry, index) => {
      if (kinds[index] === 'p') {
        performanceThreads += 1
        if (entry.coreKey !== null) performanceKeys.add(entry.coreKey)
      } else if (kinds[index] === 'e') {
        efficiencyThreads += 1
      }
    })
    performanceCores = performanceKeys.size > 0
      ? performanceKeys.size
      : Math.ceil(performanceThreads / 2)
    efficiencyCores = efficiencyThreads
  }
  return { hybrid, kinds, physicalCores, performanceCores, efficiencyCores }
}

/**
 * Detect Apple Silicon performance/efficiency cores through perflevel sysctls.
 * @returns Topology facts, or null.
 */
async function readDarwinCpuTopology() {
  const threads = cpus().length
  const [physicalText, pLogicalText, eLogicalText, pPhysicalText, ePhysicalText] = await Promise.all([
    execText('/usr/sbin/sysctl', ['-n', 'hw.physicalcpu'], PROBE_TIMEOUT_MS),
    execText('/usr/sbin/sysctl', ['-n', 'hw.perflevel0.logicalcpu'], PROBE_TIMEOUT_MS),
    execText('/usr/sbin/sysctl', ['-n', 'hw.perflevel1.logicalcpu'], PROBE_TIMEOUT_MS),
    execText('/usr/sbin/sysctl', ['-n', 'hw.perflevel0.physicalcpu'], PROBE_TIMEOUT_MS),
    execText('/usr/sbin/sysctl', ['-n', 'hw.perflevel1.physicalcpu'], PROBE_TIMEOUT_MS),
  ])
  const physical = numberFromText(physicalText)
  const pLogical = numberFromText(pLogicalText)
  const eLogical = numberFromText(eLogicalText)
  const pPhysical = numberFromText(pPhysicalText)
  const ePhysical = numberFromText(ePhysicalText)
  const hybrid = pLogical !== null && eLogical !== null
    && pLogical > 0 && eLogical > 0
    && pLogical + eLogical <= threads
  const kinds = Array.from({ length: threads }, (_, index) => {
    if (!hybrid) return null
    return index < pLogical ? 'p' : index < pLogical + eLogical ? 'e' : null
  })
  return {
    hybrid,
    kinds,
    physicalCores: physical ?? (pPhysical !== null && ePhysical !== null ? pPhysical + ePhysical : null),
    performanceCores: hybrid ? pPhysical : null,
    efficiencyCores: hybrid ? ePhysical : null,
  }
}

/**
 * Count the logical CPUs named by a sysfs sibling list such as `0-1` or `0,2`.
 * @param text - Sibling list.
 * @returns Number of named CPUs or null.
 */
function countCpuList(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  let count = 0
  for (const part of text.trim().split(',')) {
    const range = /^(\d+)-(\d+)$/u.exec(part.trim())
    if (range !== null) {
      count += Number(range[2]) - Number(range[1]) + 1
    } else if (/^\d+$/u.test(part.trim())) {
      count += 1
    }
  }
  return count > 0 ? count : null
}

/**
 * Build the memory block from the best source this platform offers.
 * @returns Memory facts; falls back to `os` totals when the probe fails.
 */
async function readMemory() {
  if (process.platform === 'linux') {
    const memory = await readLinuxMemory()
    if (memory !== null) return memory
  } else if (process.platform === 'darwin') {
    const memory = await readDarwinMemory()
    if (memory !== null) return memory
  } else if (process.platform === 'win32') {
    const memory = await readWindowsMemory()
    if (memory !== null) return memory
  }
  return readOsMemory()
}

/**
 * Read the Linux memory block from `/proc/meminfo`.
 * @returns Memory facts or null when the file is unavailable.
 */
async function readLinuxMemory() {
  const text = await readFile('/proc/meminfo', 'utf8').catch(() => null)
  if (text === null) return null
  const memory = parseProcMeminfo(text)
  return memory === null ? null : { ...memory, spec: null }
}

/**
 * Read macOS memory and swap.
 * @returns Memory facts or null when `vm_stat` cannot be parsed.
 */
async function readDarwinMemory() {
  const [vmStatText, swapText] = await Promise.all([
    execText('/usr/bin/vm_stat', [], PROBE_TIMEOUT_MS),
    execText('/usr/sbin/sysctl', ['-n', 'vm.swapusage'], PROBE_TIMEOUT_MS),
  ])
  const vmStat = vmStatText === null ? null : parseVmStat(vmStatText)
  const total = totalmem()
  if (vmStat === null || !(total > 0)) return null
  const available = Math.min(total, vmStat.availableBytes)
  const free = Math.min(available, vmStat.freeBytes)
  const cached = Math.max(0, available - free)
  const used = Math.max(0, total - available)
  const swap = swapText === null ? null : parseSwapusage(swapText)
  const spec = await cachedDarwinMemorySpec(readDarwinMemorySpec).catch(() => null)
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: used,
    freeBytes: free,
    cachedBytes: cached,
    usage: clampPercent((used / total) * 100),
    swapTotalBytes: swap?.totalBytes ?? null,
    swapUsedBytes: swap?.usedBytes ?? null,
    spec: memorySpecText(spec),
  }
}

/**
 * Read the macOS memory-slot description.
 * @returns Type, count, and total capacity, or null.
 */
async function readDarwinMemorySpec() {
  const text = await execText('/usr/bin/system_profiler', ['SPMemoryDataType'], 4000)
  return text === null ? null : parseSystemProfilerMemory(text)
}

/**
 * Read Windows memory: physical totals from `os`, page-file usage from CIM.
 * @returns Memory facts or null when the physical total is unknown.
 */
async function readWindowsMemory() {
  const total = totalmem()
  if (!(total > 0)) return null
  const available = Math.min(total, freemem())
  const used = Math.max(0, total - available)
  const [swap, info] = await Promise.all([
    readWindowsSwap().catch(() => null),
    cachedWindowsStatic(readWindowsStatic).catch(() => null),
  ])
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: used,
    freeBytes: available,
    cachedBytes: null,
    usage: clampPercent((used / total) * 100),
    swapTotalBytes: swap?.totalBytes ?? null,
    swapUsedBytes: swap?.usedBytes ?? null,
    spec: memorySpecText(info?.memory),
  }
}

/**
 * Query Windows page-file usage, reusing a recent answer.
 * @returns Page-file bytes; zeroes when Windows reports no page file, or null.
 */
async function readWindowsSwap() {
  if (swapCache.platform === 'win32'
    && swapCache.value !== undefined
    && Date.now() - swapCache.at < SWAP_CACHE_MS) {
    return swapCache.value
  }
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('Get-CimInstance -ClassName Win32_PageFileUsage -ErrorAction SilentlyContinue | '
      + 'Select-Object AllocatedBaseSize,CurrentUsage | ConvertTo-Json -Compress'),
  ], POWERSHELL_TIMEOUT_MS)
  const value = text === null
    ? null
    : parsePageFileUsage(text) ?? { totalBytes: 0, usedBytes: 0 }
  swapCache = { platform: 'win32', at: Date.now(), value }
  return value
}

/**
 * Fallback memory block based on Node's portable totals. Available memory can
 * under-report reclaimable cache on macOS, so it is only used when the native
 * probe fails.
 * @returns Memory facts with unknown swap.
 */
function readOsMemory() {
  const total = totalmem()
  const available = Math.max(0, Math.min(total, freemem()))
  const used = Math.max(0, total - available)
  return {
    totalBytes: total > 0 ? total : null,
    availableBytes: total > 0 ? available : null,
    usedBytes: total > 0 ? used : null,
    freeBytes: total > 0 ? available : null,
    cachedBytes: null,
    usage: total > 0 ? clampPercent((used / total) * 100) : null,
    swapTotalBytes: null,
    swapUsedBytes: null,
    spec: null,
  }
}

/**
 * Build the disk-usage rows.
 * @returns Up to four local filesystems.
 */
async function readDisks() {
  if (process.platform === 'linux') return await readLinuxDisks()
  if (process.platform === 'darwin') return await readDarwinDisks()
  if (process.platform === 'win32') return await readWindowsDiskRows()
  return []
}

/**
 * Read Linux mounts and statfs usage.
 * @returns Disk rows.
 */
async function readLinuxDisks() {
  const text = await readFile('/proc/mounts', 'utf8').catch(() => null)
  if (text === null) return []
  const mounts = parseMounts(text) ?? []
  const priority = (mount) => {
    if (mount === '/') return 0
    if (mount === '/home') return 1
    if (mount === '/boot') return 2
    if (mount === '/boot/efi') return 3
    return 10
  }
  const seen = new Set()
  const chosen = []
  for (const mount of [...mounts].sort((left, right) => priority(left.mount) - priority(right.mount))) {
    if (seen.has(mount.device)) continue
    seen.add(mount.device)
    chosen.push(mount)
    if (chosen.length >= 4) break
  }
  const rows = await Promise.all(chosen.map(async (mount) => {
    const usage = await readStatfsUsage(mount.mount)
    if (usage === null) return null
    return {
      device: basename(mount.device),
      mount: mount.mount,
      label: null,
      fs: mount.fs,
      ...usage,
    }
  }))
  return rows.filter((row) => row !== null)
}

/**
 * Read one `statfs` result.
 * @param mount - Mount point.
 * @returns Total, used, and available bytes plus a percentage.
 */
async function readStatfsUsage(mount) {
  try {
    const stats = await statfs(mount)
    const blockSize = Number(stats.bsize)
    const blocks = Number(stats.blocks)
    const freeBlocks = Number(stats.bfree)
    const availableBlocks = Number(stats.bavail)
    if (!(blockSize > 0) || !(blocks > 0) || !Number.isFinite(freeBlocks)) return null
    const totalBytes = blocks * blockSize
    const usedBytes = Math.max(0, (blocks - freeBlocks) * blockSize)
    const availableBytes = Math.max(0, (Number.isFinite(availableBlocks) ? availableBlocks : freeBlocks) * blockSize)
    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usage: clampPercent((usedBytes / totalBytes) * 100),
    }
  } catch {
    return null
  }
}

/**
 * Read macOS disk usage with `df` and filesystem types with `mount`.
 * @returns Disk rows.
 */
async function readDarwinDisks() {
  const [dfText, mountText] = await Promise.all([
    execText('/bin/df', ['-kP'], PROBE_TIMEOUT_MS),
    execText('/sbin/mount', [], PROBE_TIMEOUT_MS),
  ])
  const rows = dfText === null ? null : parseDf(dfText)
  if (rows === null) return []
  const types = parseMacMountTypes(mountText)
  const usable = rows.filter((row) => (
    row.device.startsWith('/dev/')
    && (row.mount === '/'
      || row.mount === '/System/Volumes/Data'
      || (row.mount.startsWith('/Volumes/')
        && !/^\/Volumes\/(?:Recovery|VM|Preboot|Update|xarts|iSCPreboot|Hardware)/u.test(row.mount)))
  ))
  const dataRow = usable.find((row) => row.mount === '/System/Volumes/Data') ?? null
  const rootRow = usable.find((row) => row.mount === '/') ?? null
  const external = usable.filter((row) => row.mount.startsWith('/Volumes/'))
  const ordered = dataRow !== null
    ? [dataRow, ...external]
    : rootRow !== null ? [rootRow, ...external] : external
  const seen = new Set()
  return ordered
    .filter((row) => {
      if (!(row.totalBytes > 0)) return false
      if (seen.has(row.device)) return false
      seen.add(row.device)
      return true
    })
    .slice(0, 4)
    .map((row) => ({
      device: basename(row.device),
      mount: row.mount,
      label: dataRow !== null && row.mount === '/System/Volumes/Data' ? 'Macintosh HD' : null,
      fs: types.get(row.mount) ?? null,
      totalBytes: row.totalBytes,
      usedBytes: row.usedBytes,
      availableBytes: row.availableBytes,
      usage: row.totalBytes > 0 ? clampPercent((row.usedBytes / row.totalBytes) * 100) : null,
    }))
}

/**
 * Map macOS mount points to filesystem types.
 * @param text - `mount` output.
 * @returns Mount-point to filesystem-type map.
 */
function parseMacMountTypes(text) {
  const types = new Map()
  if (typeof text !== 'string') return types
  for (const line of text.split('\n')) {
    const match = /^(.+?) on (.+?) \(([^,)]+)/u.exec(line.trim())
    if (match !== null) types.set(match[2], match[3].trim())
  }
  return types
}

/**
 * Read Windows logical-disk usage.
 * @returns Disk rows.
 */
async function readWindowsDiskRows() {
  return cachedWindowsDisks(async () => {
    const text = await execText('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      withUtf8PowerShell('Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | '
        + 'Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress'),
    ], POWERSHELL_TIMEOUT_MS)
    const disks = text === null ? null : parseWindowsDisks(text)
    return (disks ?? []).map((disk) => ({
      ...disk,
      usage: disk.totalBytes > 0 ? clampPercent((disk.usedBytes / disk.totalBytes) * 100) : null,
    })).sort((left, right) => left.mount.localeCompare(right.mount)).slice(0, 4)
  })
}

/**
 * Read aggregate disk throughput.
 * @returns Read/write bytes per second or null.
 */
async function readDiskIo() {
  if (process.platform === 'linux') {
    const delta = await sampleDelta(linuxDiskRate, sampleLinuxDiskIo)
    if (delta === null) return null
    return ratesFromDelta(delta, 'readBytes', 'writeBytes', 'readBytesPerSecond', 'writeBytesPerSecond')
  }
  if (process.platform === 'darwin') {
    const delta = await sampleDelta(darwinDiskRate, sampleDarwinDiskIo)
    if (delta === null) return null
    return ratesFromDelta(delta, 'readBytes', 'writeBytes', 'readBytesPerSecond', 'writeBytesPerSecond')
  }
  if (process.platform === 'win32') return await readWindowsDiskIo()
  return null
}

/**
 * Sample Linux disk byte counters.
 * @returns Summed counters and sample time.
 */
async function sampleLinuxDiskIo() {
  const text = await readFile('/proc/diskstats', 'utf8').catch(() => null)
  if (text === null) return null
  const disks = parseDiskstats(text)
  if (disks === null) return null
  let readBytes = 0
  let writeBytes = 0
  for (const disk of disks) {
    readBytes += disk.readBytes
    writeBytes += disk.writeBytes
  }
  return { at: Date.now(), readBytes, writeBytes }
}

/**
 * Sample macOS block-storage byte counters.
 * @returns Summed counters and sample time.
 */
async function sampleDarwinDiskIo() {
  const text = await execText(
    '/usr/sbin/ioreg',
    ['-r', '-c', 'IOBlockStorageDriver', '-d', '1', '-w', '0'],
    PROBE_TIMEOUT_MS,
    IOREG_MAX_BUFFER,
  )
  const counters = text === null ? null : parseIoregBlockStorage(text)
  if (counters === null) return null
  return {
    at: Date.now(),
    readBytes: counters.readBytes,
    writeBytes: counters.writeBytes,
  }
}

/**
 * Read Windows aggregate disk throughput from formatted perf counters.
 * @returns Read/write bytes per second or null.
 */
async function readWindowsDiskIo() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$rows = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfDisk_PhysicalDisk -ErrorAction SilentlyContinue; '
      + '$total = $rows | Where-Object { $_.Name -match "_Total$" } | Select-Object -First 1; '
      + 'if (-not $total) { $total = $rows | Select-Object -First 1 }; '
      + 'if ($total) { [pscustomobject]@{ read = [double]$total.DiskReadBytesPersec; write = [double]$total.DiskWriteBytesPersec } | ConvertTo-Json -Compress }'),
  ], POWERSHELL_TIMEOUT_MS)
  if (text === null) return null
  const parsed = parseJsonValue(text)
  if (parsed === null || typeof parsed !== 'object') return null
  return {
    readBytesPerSecond: nonNegativeNumber(parsed.read),
    writeBytesPerSecond: nonNegativeNumber(parsed.write),
  }
}

/**
 * Read the active network interface.
 * @returns Interface, speed, addresses, cumulative bytes, and rates.
 */
async function readNetwork() {
  if (process.platform === 'linux') {
    const delta = await sampleDelta(linuxNetworkRate, sampleLinuxNetwork)
    return networkResult(delta)
  }
  if (process.platform === 'darwin') {
    const delta = await sampleDelta(darwinNetworkRate, sampleDarwinNetwork)
    return networkResult(delta)
  }
  if (process.platform === 'win32') return await readWindowsNetwork()
  return null
}

/**
 * Sample Linux network counters and pick the active interface.
 * @returns Sample with interface identity and counters.
 */
async function sampleLinuxNetwork() {
  const [devText, routeText] = await Promise.all([
    readFile('/proc/net/dev', 'utf8').catch(() => null),
    readFile('/proc/net/route', 'utf8').catch(() => null),
  ])
  if (devText === null) return null
  const counters = parseNetDev(devText)
  if (counters === null || counters.length === 0) return null
  const routeInterface = parseLinuxDefaultRoute(routeText)
  const addresses = networkInterfaces()
  const chosen = pickLinuxInterface(counters, addresses, routeInterface)
  if (chosen === null) return null
  const ipv4 = ipv4Of(addresses[chosen.interface])
  const speed = await readLinuxLinkSpeed(chosen.interface)
  return {
    at: Date.now(),
    interface: chosen.interface,
    ipv4,
    linkSpeedMbps: speed,
    receivedBytes: chosen.receivedBytes,
    transmittedBytes: chosen.transmittedBytes,
  }
}

/**
 * Read the Linux default route interface.
 * @param text - `/proc/net/route` contents.
 * @returns Interface name or null.
 */
function parseLinuxDefaultRoute(text) {
  if (typeof text !== 'string') return null
  for (const line of text.split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/u)
    if (fields.length < 8) continue
    if (fields[1] === '00000000' && (Number.parseInt(fields[3], 16) & 1) === 1) return fields[0]
  }
  return null
}

/**
 * Choose the physical interface carrying this host's traffic.
 * @param counters - `/proc/net/dev` rows.
 * @param addresses - `os.networkInterfaces()` map.
 * @param routeInterface - Default-route interface when known.
 * @returns Chosen row or null.
 */
function pickLinuxInterface(counters, addresses, routeInterface) {
  const candidates = counters.filter((entry) => {
    const address = ipv4Of(addresses[entry.interface])
    return address !== null && !isVirtualInterface(entry.interface)
  })
  const routed = candidates.find((entry) => entry.interface === routeInterface)
  if (routed !== undefined) return routed
  if (candidates.length > 0) {
    return candidates.reduce((best, entry) => (
      entry.receivedBytes + entry.transmittedBytes > best.receivedBytes + best.transmittedBytes ? entry : best
    ))
  }
  const fallback = counters.filter((entry) => ipv4Of(addresses[entry.interface]) !== null)
  return fallback.length === 0 ? null : fallback[0]
}

/**
 * Read a Linux interface's negotiated speed.
 * @param interfaceName - Interface name.
 * @returns Megabits per second or null.
 */
async function readLinuxLinkSpeed(interfaceName) {
  const text = await readTextFile(`/sys/class/net/${interfaceName}/speed`)
  if (text === null) return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null
}

/**
 * Sample macOS network counters and pick the active interface.
 * @returns Sample with interface identity and counters.
 */
async function sampleDarwinNetwork() {
  const text = await execText('/usr/sbin/netstat', ['-ibn'], PROBE_TIMEOUT_MS)
  const counters = text === null ? null : parseNetstatIb(text)
  if (counters === null || counters.length === 0) return null
  const addresses = networkInterfaces()
  const candidates = counters.filter((entry) => (
    ipv4Of(addresses[entry.interface]) !== null && !isVirtualInterface(entry.interface)
  ))
  const pool = candidates.length > 0 ? candidates : counters.filter((entry) => ipv4Of(addresses[entry.interface]) !== null)
  if (pool.length === 0) return null
  const chosen = pool.reduce((best, entry) => (
    entry.receivedBytes + entry.transmittedBytes > best.receivedBytes + best.transmittedBytes ? entry : best
  ))
  return {
    at: Date.now(),
    interface: chosen.interface,
    ipv4: ipv4Of(addresses[chosen.interface]),
    linkSpeedMbps: await readDarwinLinkSpeed(chosen.interface),
    receivedBytes: chosen.receivedBytes,
    transmittedBytes: chosen.transmittedBytes,
  }
}

/** Cached macOS link speeds keyed by interface. */
const darwinLinkSpeeds = new Map()

/**
 * Read a macOS interface's media speed.
 * @param interfaceName - Interface name.
 * @returns Megabits per second or null.
 */
async function readDarwinLinkSpeed(interfaceName) {
  const cached = darwinLinkSpeeds.get(interfaceName)
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.value
  const text = await execText('/sbin/ifconfig', [interfaceName], PROBE_TIMEOUT_MS)
  const value = text === null ? null : parseIfconfigMedia(text)
  darwinLinkSpeeds.set(interfaceName, { at: Date.now(), value })
  return value
}

/**
 * Read Windows network counters.
 * @returns Network snapshot or null.
 */
async function readWindowsNetwork() {
  const adapters = await readWindowsAdapters()
  if (adapters === null) return await readWindowsNetworkFallback()
  const addresses = networkInterfaces()
  const chosen = pickWindowsAdapter(adapters, addresses)
  if (chosen === null) return null
  const ipv4 = ipv4Of(addresses[chosen.interface]) ?? firstIpv4(addresses)
  if (chosen.receivedBytes === null || chosen.transmittedBytes === null) {
    const fallback = await readWindowsNetworkFallback().catch(() => null)
    return {
      interface: chosen.interface,
      ipv4,
      linkSpeedMbps: chosen.linkSpeedMbps,
      downBytesPerSecond: fallback?.downBytesPerSecond ?? chosen.downBytesPerSecond ?? null,
      upBytesPerSecond: fallback?.upBytesPerSecond ?? chosen.upBytesPerSecond ?? null,
      receivedBytes: null,
      transmittedBytes: null,
    }
  }
  const sample = {
    at: Date.now(),
    interface: chosen.interface,
    receivedBytes: chosen.receivedBytes,
    transmittedBytes: chosen.transmittedBytes,
  }
  const previous = windowsNetworkRate.platform === 'win32' ? windowsNetworkRate.value : null
  windowsNetworkRate.platform = 'win32'
  windowsNetworkRate.value = sample
  const reusable = previous !== null
    && previous.interface === sample.interface
    && sample.at - previous.at >= RATE_MIN_WINDOW_MS
    && sample.at - previous.at <= RATE_MAX_AGE_MS
  const down = reusable ? ratePerSecond(previous, sample, 'receivedBytes') : null
  const up = reusable ? ratePerSecond(previous, sample, 'transmittedBytes') : null
  return {
    interface: sample.interface,
    ipv4,
    linkSpeedMbps: chosen.linkSpeedMbps,
    downBytesPerSecond: down,
    upBytesPerSecond: up,
    receivedBytes: sample.receivedBytes,
    transmittedBytes: sample.transmittedBytes,
  }
}

/**
 * Query Windows adapter statistics.
 * @returns Adapter rows or null.
 */
async function readWindowsAdapters() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$rows = foreach ($a in (Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" })) { '
      + '$s = Get-NetAdapterStatistics -Name $a.Name -ErrorAction SilentlyContinue; '
      + '[pscustomobject]@{ name = $a.Name; description = $a.InterfaceDescription; linkSpeed = $a.LinkSpeed; linkSpeedBits = $a.LinkSpeedBits; receivedBytes = $s.ReceivedBytes; transmittedBytes = $s.SentBytes } }; '
      + '@($rows) | ConvertTo-Json -Compress'),
  ], POWERSHELL_TIMEOUT_MS)
  return text === null ? null : parseWindowsNetwork(text)
}

/**
 * Query Windows network perf counters when adapter statistics are unavailable.
 * @returns Rate-only network snapshot or null.
 */
async function readWindowsNetworkFallback() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('Get-CimInstance -ClassName Win32_PerfFormattedData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue | '
      + 'Select-Object Name,BytesReceivedPersec,BytesSentPersec | ConvertTo-Json -Compress'),
  ], POWERSHELL_TIMEOUT_MS)
  const adapters = text === null ? null : parseWindowsPerfNetwork(text)
  if (adapters === null || adapters.length === 0) return null
  const chosen = adapters.reduce((best, entry) => (
    (entry.downBytesPerSecond ?? 0) + (entry.upBytesPerSecond ?? 0)
      > (best.downBytesPerSecond ?? 0) + (best.upBytesPerSecond ?? 0) ? entry : best
  ))
  const addresses = networkInterfaces()
  return {
    interface: chosen.interface,
    ipv4: firstIpv4(addresses),
    linkSpeedMbps: null,
    downBytesPerSecond: chosen.downBytesPerSecond,
    upBytesPerSecond: chosen.upBytesPerSecond,
    receivedBytes: null,
    transmittedBytes: null,
  }
}

/**
 * Choose the Windows adapter that owns the active IPv4 address.
 * @param adapters - Parsed adapter rows.
 * @param addresses - `os.networkInterfaces()` map.
 * @returns Chosen adapter or null.
 */
function pickWindowsAdapter(adapters, addresses) {
  if (adapters.length === 0) return null
  const keys = Object.keys(addresses)
  for (const adapter of adapters) {
    const match = keys.find((key) => key.toLowerCase() === adapter.interface.toLowerCase())
    if (match !== undefined && ipv4Of(addresses[match]) !== null) return adapter
  }
  return adapters.reduce((best, entry) => (
    (entry.receivedBytes ?? 0) + (entry.transmittedBytes ?? 0)
      > (best.receivedBytes ?? 0) + (best.transmittedBytes ?? 0) ? entry : best
  ))
}

/**
 * Normalize one sampled network delta into the panel payload.
 * @param delta - Rate sample from `sampleDelta`.
 * @returns Network snapshot or null.
 */
function networkResult(delta) {
  if (delta === null) return null
  const current = delta.current
  const previous = delta.previous
  const sameInterface = previous !== null && previous.interface === current.interface
  return {
    interface: current.interface,
    ipv4: current.ipv4 ?? null,
    linkSpeedMbps: current.linkSpeedMbps ?? null,
    downBytesPerSecond: sameInterface ? ratePerSecond(previous, current, 'receivedBytes') : null,
    upBytesPerSecond: sameInterface ? ratePerSecond(previous, current, 'transmittedBytes') : null,
    receivedBytes: current.receivedBytes ?? null,
    transmittedBytes: current.transmittedBytes ?? null,
  }
}

/**
 * Read thermal and fan counters.
 * @returns Temperature rows and one fan.
 */
async function readSensors() {
  if (process.platform === 'linux') return await cachedSensors(readLinuxSensors)
  if (process.platform === 'win32') return await cachedSensors(readWindowsSensors)
  return { temperatures: [], fan: null }
}

/**
 * Read Linux hwmon temperatures and fans.
 * @returns Temperature rows and one fan.
 */
async function readLinuxSensors() {
  const entries = await readdir('/sys/class/hwmon').catch(() => [])
  const dirs = entries.filter((entry) => /^hwmon\d+$/u.test(entry))
  const readings = []
  const fans = []
  await Promise.all(dirs.map(async (dir) => {
    const base = `/sys/class/hwmon/${dir}`
    const chip = (await readTextFile(`${base}/name`)) ?? dir
    const files = await readdir(base).catch(() => [])
    await Promise.all(files.map(async (file) => {
      const temperature = /^(temp\d+)_input$/u.exec(file)
      if (temperature !== null) {
        const raw = await readTextFile(`${base}/${file}`)
        const value = raw === null ? null : Number(raw)
        if (value === null || !Number.isFinite(value)) return
        const label = await readTextFile(`${base}/${temperature[1]}_label`)
        readings.push({ chip, label, celsius: value / 1000 })
        return
      }
      const fan = /^(fan\d+)_input$/u.exec(file)
      if (fan === null) return
      const raw = await readTextFile(`${base}/${file}`)
      const rpm = raw === null ? null : Number(raw)
      if (rpm === null || !Number.isFinite(rpm)) return
      const label = await readTextFile(`${base}/${fan[1]}_label`)
      const maxRaw = await readTextFile(`${base}/${fan[1]}_max`)
      const maxRpm = maxRaw === null ? null : Number(maxRaw)
      fans.push({ chip, label, rpm, maxRpm: Number.isFinite(maxRpm) ? maxRpm : null })
    }))
  }))
  return {
    temperatures: selectTemperatureSensors(readings),
    fan: selectFanReading(fans),
  }
}

/**
 * Read Windows ACPI thermal zones and fans.
 * @returns Temperature rows and one fan.
 */
async function readWindowsSensors() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$zones = Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object InstanceName,CurrentTemperature; '
      + '$fans = Get-CimInstance -ClassName Win32_Fan -ErrorAction SilentlyContinue | Select-Object DeviceID,DesiredSpeed; '
      + '[pscustomobject]@{ zones = @($zones); fans = @($fans) } | ConvertTo-Json -Compress -Depth 4'),
  ], POWERSHELL_TIMEOUT_MS)
  if (text === null) return { temperatures: [], fan: null }
  const parsed = parseJsonValue(text)
  if (parsed === null || typeof parsed !== 'object') return { temperatures: [], fan: null }
  const temperatures = selectTemperatureSensors(
    parseWindowsThermalZones(JSON.stringify(parsed.zones ?? null)) ?? [],
  )
  const fan = selectFanReading(parseWindowsFans(JSON.stringify(parsed.fans ?? null)) ?? [])
  return { temperatures, fan }
}

/**
 * Add the GPU temperature to the sensor rows.
 * @param temperatures - Selected temperature rows.
 * @param gpu - GPU snapshot.
 * @returns Rows with one GPU entry when the driver reports a temperature.
 */
function mergeGpuTemperature(temperatures, gpu) {
  const value = gpu?.temperatureCelsius
  if (!Number.isFinite(value)) return temperatures
  const row = { key: 'gpu', label: null, celsius: Math.round(value * 10) / 10 }
  const index = temperatures.findIndex((entry) => entry.key === 'gpu')
  if (index >= 0) {
    return temperatures.map((entry, position) => (position === index ? row : entry))
  }
  const cpuIndex = temperatures.findIndex((entry) => entry.key === 'cpu')
  if (cpuIndex < 0) return [...temperatures, row]
  return [...temperatures.slice(0, cpuIndex + 1), row, ...temperatures.slice(cpuIndex + 1)]
}

/**
 * Read the top CPU-consuming processes.
 * @returns Process totals and the top eight rows.
 */
async function readProcesses() {
  if (process.platform === 'linux' || process.platform === 'darwin') {
    return await cachedProcesses(readUnixProcesses)
  }
  if (process.platform === 'win32') return await cachedProcesses(readWindowsProcesses)
  return null
}

/**
 * Read processes through `ps` on Linux and macOS.
 * @returns Process totals and top rows.
 */
async function readUnixProcesses() {
  const text = await execText('ps', process.platform === 'darwin'
    ? ['-A', '-o', 'pid=,user=,%cpu=,rss=,comm=']
    : ['-e', '-o', 'pid=,user=,%cpu=,rss=,comm='], PROBE_TIMEOUT_MS)
  let processes = text === null ? null : parsePsProcesses(text)
  if (processes === null) {
    const fallback = await execText('ps', process.platform === 'darwin'
      ? ['-A', '-o', 'pid,user,%cpu,rss,comm']
      : ['-eo', 'pid,user,pcpu,rss,comm'], PROBE_TIMEOUT_MS)
    processes = fallback === null ? null : parsePsProcesses(fallback)
  }
  if (processes === null) return null
  const visible = processes.filter((entry) => !PROBE_PROCESS_NAMES.has(entry.name.toLowerCase()))
  const threads = process.platform === 'linux'
    ? parseLoadThreads(await readTextFile('/proc/loadavg'))
    : await readDarwinThreadCount()
  const vram = await readNvidiaProcessMemory().catch(() => null)
  const top = [...visible]
    .sort((left, right) => right.cpuPercent - left.cpuPercent || (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0))
    .slice(0, 8)
    .map((process) => ({
      ...process,
      gpuMemoryBytes: vram?.get(process.pid) ?? null,
    }))
  return { total: visible.length, threads, top }
}

/**
 * Read macOS' kernel thread count.
 * @returns Thread count or null.
 */
async function readDarwinThreadCount() {
  const text = await execText('/usr/sbin/sysctl', ['-n', 'kern.num_threads'], PROBE_TIMEOUT_MS)
  return numberFromText(text)
}

/**
 * Read processes through Windows process performance counters.
 * @returns Process totals and top rows.
 */
async function readWindowsProcesses() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$rows = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfProc_Process -ErrorAction SilentlyContinue | '
      + 'Where-Object { $_.Name -ne "_Total" -and $_.Name -ne "Idle" } | '
      + 'Select-Object Name,IDProcess,PercentProcessorTime,WorkingSet,ThreadCount; '
      + '[pscustomobject]@{ processes = @($rows) } | ConvertTo-Json -Compress -Depth 4'),
  ], POWERSHELL_TIMEOUT_MS)
  return text === null ? null : parseWindowsProcesses(text)
}

/**
 * Read per-process NVIDIA VRAM when an NVIDIA GPU is active.
 * @returns PID to VRAM-byte map or null.
 */
async function readNvidiaProcessMemory() {
  if (lastGpu?.vendor !== 'nvidia') return null
  const rows = await cachedNvidiaApps(async () => {
    const text = await execText('nvidia-smi', [
      '--query-compute-apps=pid,used_memory',
      '--format=csv,noheader,nounits',
    ], PROBE_TIMEOUT_MS)
    return text === null ? null : parseNvidiaComputeApps(text)
  })
  if (rows === null || rows.length === 0) return null
  return new Map(rows.map((row) => [row.pid, row.memoryBytes]))
}

/**
 * Probe the GPU, reusing a recent probe result.
 * @returns GPU facts; `available: false` carries the reason.
 */
async function readGpu() {
  const gpu = await cachedGpu(async () => {
    const value = (await probeNvidia().catch(() => null))
      ?? (await probePlatformGpu().catch(() => null))
      ?? missingGpu()
    return normalizeGpu(value)
  }).catch(() => normalizeGpu(missingGpu()))
  lastGpu = gpu
  return gpu
}

/**
 * Query NVIDIA hardware through `nvidia-smi`.
 * @returns GPU facts, or null when the tool or driver is unavailable.
 */
async function probeNvidia() {
  const [queryText, headerText] = await Promise.all([
    execText('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,power.draw,power.limit,'
        + 'fan.speed,temperature.gpu,driver_version,clocks.current.graphics,clocks.current.memory',
      '--format=csv,noheader,nounits',
    ], PROBE_TIMEOUT_MS),
    execText('nvidia-smi', [], PROBE_TIMEOUT_MS),
  ])
  const gpu = queryText === null ? null : parseNvidiaSmi(queryText)
  if (gpu === null) return null
  const header = headerText === null ? null : parseNvidiaSmiHeader(headerText)
  if (header !== null) {
    gpu.cudaVersion = header.cudaVersion ?? gpu.cudaVersion
    gpu.driverVersion = gpu.driverVersion ?? header.driverVersion
  }
  return gpu
}

/**
 * Dispatch to the platform-specific GPU probe.
 * @returns GPU facts or null when the platform has no probe.
 */
async function probePlatformGpu() {
  if (process.platform === 'linux') {
    return (await probeAmdLinux()) ?? (await probeIntelLinux()) ?? (await describeLinuxGpu())
  }
  if (process.platform === 'darwin') return await probeDarwinGpu()
  if (process.platform === 'win32') return await probeWindowsGpu()
  return null
}

/**
 * Read AMD utilization, VRAM, temperature, fan, power, and clocks from sysfs.
 * @returns GPU facts, or null when no amdgpu device publishes them.
 */
async function probeAmdLinux() {
  const cards = await readdir('/sys/class/drm').catch(() => [])
  for (const card of cards.filter((entry) => /^card\d+$/u.test(entry)).sort()) {
    const device = `/sys/class/drm/${card}/device`
    const utilization = await readTextFile(`${device}/gpu_busy_percent`)
    if (utilization === null) continue
    const name = (await readTextFile(`${device}/product_name`)) ?? 'AMD GPU'
    const hwmon = await readHwmonDir(device)
    const temperature = hwmon === null ? null : await readMillidegrees(`${hwmon}/temp1_input`)
    const fanRpm = hwmon === null ? null : await readInteger(`${hwmon}/fan1_input`)
    const fanMax = hwmon === null ? null : await readInteger(`${hwmon}/fan1_max`)
    const power = hwmon === null ? null : await readMicrowatts(`${hwmon}/power1_average`)
    const powerLimit = hwmon === null ? null : await readMicrowatts(`${hwmon}/power1_cap`)
    return {
      available: true,
      vendor: 'amd',
      name,
      usage: clampPercent(Number(utilization)),
      memoryUsedBytes: await readInteger(`${device}/mem_info_vram_used`),
      memoryTotalBytes: await readInteger(`${device}/mem_info_vram_total`),
      powerWatts: power,
      powerLimitWatts: powerLimit,
      fanPercent: fanRpm !== null && fanMax !== null && fanMax > 0
        ? clampPercent((fanRpm / fanMax) * 100)
        : null,
      fanRpm,
      temperatureCelsius: temperature,
      driverVersion: await readTextFile('/sys/module/amdgpu/version'),
      cudaVersion: null,
      coreClockMhz: parseAmdClocks((await readTextFile(`${device}/pp_dpm_sclk`)) ?? ''),
      memoryClockMhz: parseAmdClocks((await readTextFile(`${device}/pp_dpm_mclk`)) ?? ''),
      reason: null,
    }
  }
  return null
}

/**
 * Describe an Intel DRM device; utilization is used when the kernel exposes it.
 * @returns GPU facts, or null when no Intel card exists.
 */
async function probeIntelLinux() {
  const cards = await readdir('/sys/class/drm').catch(() => [])
  for (const card of cards.filter((entry) => /^card\d+$/u.test(entry)).sort()) {
    const device = `/sys/class/drm/${card}/device`
    const ueventText = await readTextFile(`${device}/uevent`)
    if (ueventText === null) continue
    const uevent = parseUevent(ueventText)
    const vendor = vendorFromPciId(uevent.PCI_ID)
    if (vendor !== 'intel') continue
    const utilization = await readTextFile(`${device}/gt_busy_percent`)
    const hwmon = await readHwmonDir(device)
    const name = (await readTextFile(`${device}/product_name`)) ?? 'Intel GPU'
    return {
      available: utilization !== null,
      vendor: 'intel',
      name,
      usage: utilization === null ? null : clampPercent(Number(utilization)),
      memoryUsedBytes: null,
      memoryTotalBytes: null,
      powerWatts: null,
      powerLimitWatts: null,
      fanPercent: null,
      fanRpm: null,
      temperatureCelsius: hwmon === null ? null : await readMillidegrees(`${hwmon}/temp1_input`),
      driverVersion: await readTextFile('/sys/module/i915/version'),
      cudaVersion: null,
      coreClockMhz: null,
      memoryClockMhz: null,
      reason: utilization === null ? 'unsupported' : null,
    }
  }
  return null
}

/**
 * Describe a Linux GPU that cannot report utilization: find the NVIDIA device
 * through procfs first, then name any DRM card from PCI id and driver.
 * @returns Unavailable GPU facts, or null when no DRM device exists.
 */
async function describeLinuxGpu() {
  const nvidia = await readNvidiaProc()
  if (nvidia !== null) return nvidia
  const cards = await readdir('/sys/class/drm').catch(() => [])
  for (const card of cards.filter((entry) => /^card\d+$/u.test(entry)).sort()) {
    const device = `/sys/class/drm/${card}/device`
    const ueventText = await readTextFile(`${device}/uevent`)
    if (ueventText === null) continue
    const uevent = parseUevent(ueventText)
    const vendor = vendorFromPciId(uevent.PCI_ID)
    const driver = uevent.DRIVER
    const product = await readTextFile(`${device}/product_name`)
    if (product === null && vendor === null && driver === undefined) continue
    const name = product ?? gpuName(vendor, driver)
    if (name === null) continue
    const nvidiaDriver = vendor === 'nvidia'
    return {
      available: false,
      vendor,
      name,
      usage: null,
      memoryUsedBytes: null,
      memoryTotalBytes: null,
      powerWatts: null,
      powerLimitWatts: null,
      fanPercent: null,
      fanRpm: null,
      temperatureCelsius: null,
      driverVersion: nvidiaDriver ? await readNvidiaVersion() : null,
      cudaVersion: null,
      coreClockMhz: null,
      memoryClockMhz: null,
      reason: nvidiaDriver ? 'driver-unavailable' : 'unsupported',
    }
  }
  return null
}

/**
 * Read the NVIDIA model from procfs when `nvidia-smi` cannot answer.
 * @returns Unavailable GPU facts, or null without a procfs device.
 */
async function readNvidiaProc() {
  const directories = await readdir('/proc/driver/nvidia/gpus').catch(() => [])
  for (const directory of directories) {
    const information = await readTextFile(`/proc/driver/nvidia/gpus/${directory}/information`)
    const gpu = information === null ? null : parseNvidiaProcInformation(information)
    if (gpu !== null) {
      gpu.driverVersion = await readNvidiaVersion()
      return gpu
    }
  }
  return null
}

/**
 * Read the NVIDIA kernel-module version.
 * @returns Version text or null.
 */
async function readNvidiaVersion() {
  const text = await readTextFile('/proc/driver/nvidia/version')
  return text === null ? null : parseNvidiaProcVersion(text)
}

/**
 * Split a sysfs `uevent` file into key/value pairs.
 * @param text - File contents.
 * @returns Field map.
 */
function parseUevent(text) {
  const fields = {}
  for (const line of text.split('\n')) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return fields
}

/**
 * Map a PCI vendor id to a vendor slug.
 * @param id - `vendor:device` pair, for example `10de:2489`.
 * @returns Vendor slug or null.
 */
function vendorFromPciId(id) {
  if (typeof id !== 'string') return null
  const vendor = id.split(':')[0]?.toLowerCase()
  if (vendor === '10de') return 'nvidia'
  if (vendor === '1002') return 'amd'
  if (vendor === '8086') return 'intel'
  if (vendor === '106b') return 'apple'
  return null
}

/**
 * Name a DRM device when sysfs has no product name.
 * @param vendor - Vendor slug or null.
 * @param driver - Kernel driver name or undefined.
 * @returns Display name or null.
 */
function gpuName(vendor, driver) {
  const label = vendor === null ? null : VENDOR_LABELS[vendor]
  if (typeof label === 'string') {
    return typeof driver === 'string' && driver !== ''
      ? `${label} GPU (${driver})`
      : `${label} GPU`
  }
  return typeof driver === 'string' && driver !== '' ? `${driver} GPU` : null
}

/**
 * Read GPU utilization on macOS from IOAccelerator statistics.
 * @returns GPU facts, or null when no accelerator is present.
 */
async function probeDarwinGpu() {
  const output = await execText(
    '/usr/sbin/ioreg',
    ['-r', '-c', 'IOAccelerator', '-d', '1', '-w', '0'],
    PROBE_TIMEOUT_MS,
    IOREG_MAX_BUFFER,
  )
  return output === null ? null : parseIoregGpu(output)
}

/**
 * Describe a Windows GPU through CIM. Windows does not expose a portable
 * per-GPU utilization counter without a vendor tool, so only the model and
 * driver version are read.
 * @returns Unavailable GPU facts, or null when no real adapter is listed.
 */
async function probeWindowsGpu() {
  const info = await cachedWindowsStatic(readWindowsStatic).catch(() => null)
  const fromStatic = info?.videoControllers === null || info?.videoControllers === undefined
    ? null
    : selectVideoController(info.videoControllers)
  if (fromStatic !== null) return fromStatic
  const output = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue | '
      + 'Select-Object Name,DriverVersion | ConvertTo-Json -Compress'),
  ], POWERSHELL_TIMEOUT_MS)
  return output === null ? null : parseVideoControllers(output)
}

/**
 * Build the empty GPU description.
 * @returns Unavailable GPU facts with `not-detected`.
 */
function missingGpu() {
  return {
    available: false,
    vendor: null,
    name: null,
    usage: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    powerWatts: null,
    powerLimitWatts: null,
    fanPercent: null,
    fanRpm: null,
    temperatureCelsius: null,
    driverVersion: null,
    cudaVersion: null,
    coreClockMhz: null,
    memoryClockMhz: null,
    reason: 'not-detected',
  }
}

/**
 * Normalize one GPU description so every field is present.
 * @param value - Probe result.
 * @returns Normalized GPU block.
 */
function normalizeGpu(value) {
  const gpu = value === null || typeof value !== 'object' ? missingGpu() : value
  const available = gpu.available === true
  return {
    available,
    vendor: typeof gpu.vendor === 'string' ? gpu.vendor : null,
    name: typeof gpu.name === 'string' && gpu.name.trim() !== '' ? gpu.name.trim() : null,
    usage: numberInRange(gpu.usage, 0, 100),
    memoryUsedBytes: nonNegativeNumber(gpu.memoryUsedBytes),
    memoryTotalBytes: nonNegativeNumber(gpu.memoryTotalBytes),
    powerWatts: nonNegativeNumber(gpu.powerWatts),
    powerLimitWatts: nonNegativeNumber(gpu.powerLimitWatts),
    fanPercent: numberInRange(gpu.fanPercent, 0, 100),
    fanRpm: nonNegativeNumber(gpu.fanRpm),
    temperatureCelsius: numberInRange(gpu.temperatureCelsius, -40, 150),
    driverVersion: stringOrNull(gpu.driverVersion),
    cudaVersion: stringOrNull(gpu.cudaVersion),
    coreClockMhz: nonNegativeNumber(gpu.coreClockMhz),
    memoryClockMhz: nonNegativeNumber(gpu.memoryClockMhz),
    reason: available ? null : stringOrNull(gpu.reason) ?? (gpu.name === null ? 'not-detected' : 'unsupported'),
  }
}

/**
 * Find the hwmon directory attached to a DRM device.
 * @param device - DRM device path.
 * @returns First hwmon path or null.
 */
async function readHwmonDir(device) {
  const entries = await readdir(`${device}/hwmon`).catch(() => [])
  const dir = entries.find((entry) => /^hwmon\d+$/u.test(entry))
  return dir === undefined ? null : `${device}/hwmon/${dir}`
}

/**
 * Read a millidegree Celsius file.
 * @param path - Absolute path.
 * @returns Celsius or null.
 */
async function readMillidegrees(path) {
  const value = await readInteger(path)
  return value === null ? null : value / 1000
}

/**
 * Read a microwatt file.
 * @param path - Absolute path.
 * @returns Watts or null.
 */
async function readMicrowatts(path) {
  const value = await readInteger(path)
  return value === null ? null : value / 1e6
}

/**
 * Read an integer text file.
 * @param path - Absolute path.
 * @returns Number or null.
 */
async function readInteger(path) {
  const text = await readTextFile(path)
  if (text === null) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * Prefix a PowerShell script with the UTF-8 console setting so non-ASCII
 * volume, process, and OS names survive the pipe back to Node.
 * @param script - PowerShell body.
 * @returns Command text for `-Command`.
 */
function withUtf8PowerShell(script) {
  return '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' + script
}

/**
 * Run one bounded, non-interactive command and collect stdout.
 * @param command - Executable name or absolute path.
 * @param args - Command arguments.
 * @param timeoutMs - Hard limit; the child is killed past it.
 * @param maxBuffer - Largest stdout accepted before the probe is treated as failed.
 * @returns Stdout text, or null on any failure.
 */
function execText(command, args, timeoutMs, maxBuffer = DEFAULT_MAX_BUFFER) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout) => {
      resolve(error === null ? String(stdout) : null)
    })
  })
}

/**
 * Read a small text file, treating absence as an expected answer.
 * @param path - Absolute file path.
 * @returns Trimmed contents or null.
 */
async function readTextFile(path) {
  const text = await readFile(path, 'utf8').catch(() => null)
  return text === null ? null : text.replace(/\0/gu, '').trim()
}

/**
 * Take two samples and compute the rates between them.
 * @param state - Per-feature state `{value, pending, platform}`.
 * @param sample - Async sampler returning `{at, ...}`.
 * @returns `{current, previous}` or null.
 */
async function sampleDelta(state, sample) {
  if (state.platform !== process.platform) {
    state.platform = process.platform
    state.value = null
    state.pending = null
  }
  if (state.pending !== null) return state.pending
  const run = async () => {
    const first = await sample()
    if (first === null) return null
    const previous = state.value
    const gap = previous === null ? 0 : first.at - previous.at
    if (previous !== null && gap >= RATE_MIN_WINDOW_MS && gap <= RATE_MAX_AGE_MS) {
      state.value = first
      return { current: first, previous }
    }
    const wait = previous !== null && gap >= 0 && gap < RATE_MIN_WINDOW_MS
      ? RATE_MIN_WINDOW_MS - gap
      : RATE_MIN_WINDOW_MS
    if (wait > 0) await delay(wait)
    const next = await sample()
    if (next === null) return null
    state.value = next
    return { current: next, previous: first }
  }
  const promise = run().finally(() => {
    state.pending = null
  })
  state.pending = promise
  return promise
}

/**
 * Compute one per-second rate from two cumulative samples.
 * @param previous - Earlier sample.
 * @param current - Later sample.
 * @param field - Counter field.
 * @returns Bytes per second or null.
 */
function ratePerSecond(previous, current, field) {
  const before = previous?.[field]
  const after = current?.[field]
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  const seconds = (current.at - previous.at) / 1000
  if (!(seconds > 0)) return null
  return Math.max(0, (after - before) / seconds)
}

/**
 * Compute read/write rates from a `sampleDelta` result.
 * @param delta - Sample pair.
 * @param readField - Cumulative read field name.
 * @param writeField - Cumulative write field name.
 * @param readRate - Output read field name.
 * @param writeRate - Output write field name.
 * @returns Rate block.
 */
function ratesFromDelta(delta, readField, writeField, readRate, writeRate) {
  return {
    [readRate]: ratePerSecond(delta.previous, delta.current, readField),
    [writeRate]: ratePerSecond(delta.previous, delta.current, writeField),
  }
}

/**
 * Clamp a percentage into its display range.
 * @param value - Raw percentage.
 * @returns Value within 0-100.
 */
function clampPercent(value) {
  if (!Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

/**
 * Normalize a numeric range.
 * @param value - Raw number.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns Number or null.
 */
function numberInRange(value, min, max) {
  const parsed = numeric(value)
  if (parsed === null || parsed < min || parsed > max) return null
  return parsed
}

/**
 * Normalize a non-negative number.
 * @param value - Raw number.
 * @returns Number or null.
 */
function nonNegativeNumber(value) {
  const parsed = numeric(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

/**
 * Normalize a numeric value without treating null as zero.
 * @param value - Raw value.
 * @returns Number or null.
 */
function numeric(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Normalize a non-empty string.
 * @param value - Raw value.
 * @returns Trimmed string or null.
 */
function stringOrNull(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Parse a numeric command output.
 * @param text - Text or null.
 * @returns Number or null.
 */
function numberFromText(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  const value = Number(text.trim())
  return Number.isFinite(value) ? value : null
}

/**
 * Resolve after a delay.
 * @param ms - Milliseconds to wait.
 * @returns Nothing once the timer fires.
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Find the first non-internal IPv4 address on one interface.
 * @param entries - `os.networkInterfaces()` entry list.
 * @returns Address or null.
 */
function ipv4Of(entries) {
  if (!Array.isArray(entries)) return null
  const entry = entries.find((candidate) => (
    candidate !== null
    && typeof candidate === 'object'
    && (candidate.family === 'IPv4' || candidate.family === 4)
    && candidate.internal !== true
    && typeof candidate.address === 'string'
  ))
  return entry === undefined ? null : entry.address
}

/**
 * Find the first non-internal IPv4 address across every interface.
 * @param addresses - `os.networkInterfaces()` map.
 * @returns Address or null.
 */
function firstIpv4(addresses) {
  for (const entries of Object.values(addresses ?? {})) {
    const address = ipv4Of(entries)
    if (address !== null) return address
  }
  return null
}

/**
 * Recognize interfaces that should not represent the machine's network.
 * @param name - Interface name.
 * @returns Whether the interface is virtual.
 */
function isVirtualInterface(name) {
  return /^(lo|docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|tailscale|wg|zt|awdl|llw|utun|bridge|anpi|ap\d|vnic|dummy)/iu.test(name)
}

/**
 * Detect the Linux desktop and session type from the environment.
 * @returns Display string such as `GNOME · Wayland`, or null.
 */
function detectLinuxDesktop() {
  const raw = process.env.XDG_CURRENT_DESKTOP ?? process.env.DESKTOP_SESSION ?? ''
  let desktop = raw.split(':').filter((part) => part !== '').pop() ?? ''
  if (desktop === '') desktop = process.env.WAYLAND_DISPLAY !== undefined ? 'Wayland' : ''
  const session = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY !== undefined
    ? 'Wayland'
    : process.env.XDG_SESSION_TYPE === 'x11' || process.env.DISPLAY !== undefined ? 'X11' : ''
  if (desktop === '') return session === '' ? null : session
  if (session === '' || desktop.toLowerCase().includes(session.toLowerCase())) return desktop
  return `${desktop} · ${session}`
}

/**
 * Map Node's architecture names to the ones the panel displays.
 * @param value - `os.arch()` result.
 * @returns Display architecture.
 */
function mapArch(value) {
  if (value === 'x64') return 'x86_64'
  if (value === 'ia32') return 'x86'
  return typeof value === 'string' ? value : null
}

/**
 * Human-readable operating-system family.
 * @returns Family name.
 */
function platformName() {
  if (process.platform === 'linux') return 'Linux'
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'win32') return 'Windows'
  return process.platform
}

/**
 * Normalize a PowerShell property that may be an object or an array.
 * @param value - Parsed JSON value.
 * @returns Array of entries.
 */
function asEntries(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && typeof entry === 'object')
  return value !== null && typeof value === 'object' ? [value] : []
}

/**
 * Last path segment.
 * @param value - Path.
 * @returns Basename.
 */
function basename(value) {
  if (typeof value !== 'string') return ''
  const parts = value.split('/')
  return parts[parts.length - 1] || value
}

/**
 * Build the memory-spec line the panel shows.
 * @param spec - Parsed module summary.
 * @returns Text such as `DDR5 · 2 × 32 GB`, or null.
 */
function memorySpecText(spec) {
  if (spec === null || typeof spec !== 'object') return null
  const type = stringOrNull(spec.type)
  const total = nonNegativeNumber(spec.totalBytes)
  const count = Number.isFinite(spec.count) && spec.count > 0 ? Math.round(spec.count) : null
  if (total === null || total <= 0) return null
  let size
  if (count !== null && count > 1) {
    size = `${count} × ${formatHostBytes(total / count)}`
  } else {
    size = formatHostBytes(total)
  }
  return type === null ? size : `${type} · ${size}`
}

/**
 * Format a byte count for the memory-spec line.
 * @param bytes - Byte count.
 * @returns Text such as `32 GB`.
 */
function formatHostBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = [
    [1024 ** 4, 'TB'],
    [1024 ** 3, 'GB'],
    [1024 ** 2, 'MB'],
    [1024, 'KB'],
  ]
  for (const [factor, unit] of units) {
    if (bytes >= factor) {
      const value = bytes / factor
      const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : Math.round(value * 10) / 10
      return `${rounded} ${unit}`
    }
  }
  return `${Math.round(bytes)} B`
}
