/**
 * Pure output parsers for the Local machine Host half.
 *
 * Every function here turns text captured from procfs, sysfs, or a platform
 * command into plain data, so the same fixtures can cover Linux, macOS, and
 * Windows on any developer machine. Sampling and platform dispatch live in
 * `platform.js`.
 */

/** Local filesystems a disk-usage row may describe. */
const LOCAL_FILESYSTEMS = new Set([
  'ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'zfs',
  'vfat', 'msdos', 'fat', 'exfat', 'ntfs', 'ntfs3', 'fuseblk',
  'f2fs', 'bcachefs', 'hfs', 'hfsplus', 'apfs',
  'jfs', 'reiserfs', 'nilfs2', 'ufs', 'ufs2',
])

/** SMBIOS memory type ids mapped to their marketing names. */
const MEMORY_TYPES = {
  20: 'DDR',
  21: 'DDR2',
  22: 'DDR2 FB-DIMM',
  24: 'DDR3',
  26: 'DDR4',
  27: 'LPDDR',
  28: 'LPDDR2',
  29: 'LPDDR3',
  30: 'LPDDR4',
  34: 'DDR5',
  35: 'LPDDR5',
}

/**
 * Clamp one percentage into its display range.
 * @param value - Raw percentage.
 * @returns Value within 0-100.
 */
function clampPercent(value) {
  return Math.min(100, Math.max(0, value))
}

/**
 * Parse one numeric cell.
 * @param value - Text or number.
 * @returns Finite number or null.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse one utilization cell, dropping percent signs and spacing.
 * @param value - Text or number.
 * @returns Percentage or null.
 */
function toPercent(value) {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[%\s]/gu, '')
    if (cleaned === '' || /[a-z]/iu.test(cleaned)) return null
    return toPercent(Number(cleaned))
  }
  const parsed = toNumber(value)
  return parsed === null ? null : clampPercent(parsed)
}

/**
 * Convert an `nvidia-smi` MiB cell to bytes.
 * @param value - Text cell.
 * @returns Byte count or null.
 */
function mebibytes(value) {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.round(parsed * 1024 * 1024)
}

/**
 * Decode one JSON payload, tolerating a UTF-8 BOM.
 * @param text - JSON text.
 * @returns Parsed value, or null for empty or invalid JSON.
 */
export function parseJsonValue(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.replace(/^\uFEFF/u, '').trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/**
 * Parse a PowerShell `ConvertTo-Json` payload into a list of entries.
 * @param text - JSON text, possibly with a UTF-8 BOM.
 * @returns Array of entries, or null for empty or invalid JSON.
 */
export function parseJsonEntries(text) {
  const parsed = parseJsonValue(text)
  if (parsed === null) return null
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * Parse every `cpu` line of `/proc/stat`.
 * @param text - Full `/proc/stat` contents.
 * @returns Aggregate counters plus per-logical-core counters, or null.
 */
export function parseProcStatLines(text) {
  if (typeof text !== 'string') return null
  let aggregate = null
  const cores = []
  for (const raw of text.split('\n')) {
    const match = /^(cpu\d*)\s+(.+)$/u.exec(raw.trim())
    if (match === null) continue
    const fields = match[2].split(/\s+/u).map(Number)
    if (fields.length < 4 || fields.some((value) => !Number.isFinite(value))) continue
    const counters = fields.slice(0, 8)
    const idle = (counters[3] ?? 0) + (counters[4] ?? 0)
    const total = counters.reduce((sum, value) => sum + value, 0)
    if (match[1] === 'cpu') {
      aggregate = { idle, total }
      continue
    }
    const index = Number(match[1].slice(3))
    if (Number.isFinite(index)) cores.push({ index, idle, total })
  }
  if (aggregate === null && cores.length === 0) return null
  cores.sort((left, right) => left.index - right.index)
  return { aggregate, cores }
}

/**
 * Read the aggregate `cpu` line of `/proc/stat`.
 * @param text - Full `/proc/stat` contents.
 * @returns Idle and total tick counters, or null when the line is malformed.
 */
export function parseProcStat(text) {
  const parsed = parseProcStatLines(text)
  return parsed === null ? null : parsed.aggregate
}

/**
 * Sum the per-core counters returned by `os.cpus()`.
 * @param list - Result of `os.cpus()` (or a fixture with the same shape).
 * @returns Idle and total milliseconds across all logical cores.
 */
export function aggregateCpuTimes(list) {
  let idle = 0
  let total = 0
  for (const cpu of Array.isArray(list) ? list : []) {
    const times = cpu?.times ?? {}
    for (const key of Object.keys(times)) {
      const value = times[key]
      if (Number.isFinite(value)) total += value
    }
    if (Number.isFinite(times.idle)) idle += times.idle
  }
  return { idle, total }
}

/**
 * Read every logical core's counters from `os.cpus()`.
 * @param list - Result of `os.cpus()`.
 * @returns Per-core idle and total milliseconds.
 */
export function perCoreCpuTimes(list) {
  return (Array.isArray(list) ? list : []).map((cpu) => {
    let idle = 0
    let total = 0
    const times = cpu?.times ?? {}
    for (const key of Object.keys(times)) {
      const value = times[key]
      if (Number.isFinite(value)) total += value
    }
    if (Number.isFinite(times.idle)) idle = times.idle
    return { idle, total }
  })
}

/**
 * Difference of two CPU samples as a busy percentage.
 * @param previous - Earlier sample.
 * @param next - Later sample from the same source.
 * @returns Busy percentage or null without comparable elapsed ticks.
 */
export function busyPercent(previous, next) {
  if (previous === null || previous === undefined || next === null || next === undefined) return null
  if (previous.source !== undefined && next.source !== undefined && previous.source !== next.source) {
    return null
  }
  const total = next.total - previous.total
  const idle = next.idle - previous.idle
  if (!Number.isFinite(total) || !Number.isFinite(idle) || !(total > 0)) return null
  return clampPercent(((total - idle) / total) * 100)
}

/**
 * Difference of two per-core samples as busy percentages.
 * @param previous - Earlier per-core samples.
 * @param next - Later per-core samples from the same source.
 * @returns One percentage or null per logical core.
 */
export function perCoreBusyPercents(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next)) return []
  const count = Math.min(previous.length, next.length)
  const result = []
  for (let index = 0; index < count; index += 1) {
    const before = previous[index]
    const after = next[index]
    const total = after.total - before.total
    const idle = after.idle - before.idle
    result.push(Number.isFinite(total) && total > 0
      ? clampPercent(((total - idle) / total) * 100)
      : null)
  }
  return result
}

/**
 * Parse `/proc/meminfo` into the memory block.
 * @param text - Full `/proc/meminfo` contents.
 * @returns Memory facts or null when `MemTotal` is missing.
 */
export function parseProcMeminfo(text) {
  if (typeof text !== 'string') return null
  const values = {}
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)(?:\s+kB)?\s*$/u.exec(line)
    if (match !== null) values[match[1]] = Number(match[2]) * 1024
  }
  const total = values.MemTotal
  if (total === undefined) return null
  const free = values.MemFree ?? null
  let available = values.MemAvailable ?? null
  if (available !== null) available = Math.min(total, Math.max(0, available))
  if (available !== null && free !== null && available < free) available = free
  const used = available !== null
    ? Math.max(0, total - available)
    : free !== null ? Math.max(0, total - free) : null
  const reclaimable = (values.Buffers ?? 0) + (values.Cached ?? 0) + (values.SReclaimable ?? 0)
  let cached = null
  if (available !== null && free !== null) cached = Math.max(0, available - free)
  else if (reclaimable > 0 && available === null) cached = null
  if (cached !== null && used !== null) cached = Math.min(cached, Math.max(0, total - used))
  const swapTotal = values.SwapTotal ?? null
  const swapFree = values.SwapFree ?? null
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: used,
    freeBytes: free,
    cachedBytes: cached,
    usage: used !== null && total > 0 ? clampPercent((used / total) * 100) : null,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapTotal !== null && swapFree !== null
      ? Math.max(0, swapTotal - swapFree)
      : null,
  }
}

/**
 * Parse `vm_stat` output, including the reclaimable page classes.
 * @param text - Full `vm_stat` output.
 * @returns Page size and memory buckets, or null without a free-page counter.
 */
export function parseVmStat(text) {
  if (typeof text !== 'string') return null
  const header = /page size of (\d+) bytes/u.exec(text)
  const pageSize = header === null ? 4096 : Number(header[1])
  if (!(pageSize > 0)) return null
  const pages = {}
  for (const line of text.split('\n')) {
    const match = /^([^:]+):\s+(\d+)\.?\s*$/u.exec(line.trim())
    if (match !== null) pages[match[1].trim()] = Number(match[2])
  }
  if (pages['Pages free'] === undefined) return null
  const freeBytes = (pages['Pages free'] ?? 0) * pageSize
  const inactiveBytes = (pages['Pages inactive'] ?? 0) * pageSize
  const speculativeBytes = (pages['Pages speculative'] ?? 0) * pageSize
  const cachedBytes = inactiveBytes + speculativeBytes
  return {
    pageSize,
    freeBytes,
    inactiveBytes,
    speculativeBytes,
    cachedBytes,
    availableBytes: freeBytes + cachedBytes,
  }
}

/**
 * Parse `sysctl -n vm.swapusage`.
 * @param text - For example `total = 2048.00M  used = 12.00M  free = 2036.00M`.
 * @returns Swap bytes, or null without a total.
 */
export function parseSwapusage(text) {
  if (typeof text !== 'string') return null
  const total = bytesFromSwapField(text, 'total')
  if (total === null) return null
  return { totalBytes: total, usedBytes: bytesFromSwapField(text, 'used') }
}

/**
 * Read one byte-valued field out of `vm.swapusage`.
 * @param text - Full `vm.swapusage` output.
 * @param label - Field name, for example `total`.
 * @returns Byte count or null.
 */
function bytesFromSwapField(text, label) {
  const match = new RegExp(`\\b${label}\\s*=\\s*([0-9.]+)\\s*([KMGTP]?)`, 'iu').exec(text)
  if (match === null) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const unit = (match[2] ?? '').toUpperCase()
  const factor = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 }[unit]
  return factor === undefined ? null : Math.round(value * factor)
}

/**
 * Recognize a whole physical block device in `/proc/diskstats`.
 * Partitions, device-mapper layers, loop devices, and RAM disks are excluded so
 * one write is not counted twice through its stacked devices.
 * @param name - Kernel block-device name.
 * @returns Whether the name identifies a physical disk.
 */
export function isPhysicalDiskName(name) {
  return typeof name === 'string' && /^(?:sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/u.test(name)
}

/**
 * Parse physical-disk counters out of `/proc/diskstats`.
 * @param text - Full `/proc/diskstats` contents.
 * @returns Per-disk byte counters, or null when nothing recognizable exists.
 */
export function parseDiskstats(text) {
  if (typeof text !== 'string') return null
  const disks = []
  for (const raw of text.split('\n')) {
    const fields = raw.trim().split(/\s+/u)
    if (fields.length < 14) continue
    const name = fields[2]
    if (!isPhysicalDiskName(name)) continue
    const readSectors = Number(fields[5])
    const writeSectors = Number(fields[9])
    if (!Number.isFinite(readSectors) || !Number.isFinite(writeSectors)) continue
    disks.push({
      name,
      readBytes: readSectors * 512,
      writeBytes: writeSectors * 512,
      readOps: toNumber(fields[3]),
      writeOps: toNumber(fields[7]),
    })
  }
  return disks.length === 0 ? null : disks
}

/**
 * Parse `/proc/net/dev` cumulative interface counters.
 * @param text - Full `/proc/net/dev` contents.
 * @returns One entry per interface.
 */
export function parseNetDev(text) {
  if (typeof text !== 'string') return null
  const interfaces = []
  for (const raw of text.split('\n')) {
    const match = /^\s*([^:]+):\s*(.+)$/u.exec(raw)
    if (match === null || match[1].trim() === 'Inter-|' || match[2].trim() === '') continue
    const name = match[1].trim().replace(/@.*$/u, '')
    if (name === 'face') continue
    const fields = match[2].trim().split(/\s+/u).map(Number)
    if (fields.length < 16 || fields.some((value) => !Number.isFinite(value))) continue
    interfaces.push({
      interface: name,
      receivedBytes: fields[0],
      transmittedBytes: fields[8],
    })
  }
  return interfaces
}

/**
 * Decode the octal escapes used by `/proc/mounts`.
 * @param token - One mount field.
 * @returns Decoded text.
 */
function decodeMountToken(token) {
  return token.replace(/\\([0-7]{3})/gu, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
}

/**
 * Parse `/proc/mounts`, keeping local filesystems only.
 * @param text - Full `/proc/mounts` contents.
 * @returns Mount entries with decoded paths.
 */
export function parseMounts(text) {
  if (typeof text !== 'string') return null
  const mounts = []
  for (const raw of text.split('\n')) {
    const fields = raw.trim().split(/\s+/u)
    if (fields.length < 3) continue
    const device = decodeMountToken(fields[0])
    const mount = decodeMountToken(fields[1])
    const fs = fields[2]
    if (!LOCAL_FILESYSTEMS.has(fs)) continue
    if (device.startsWith('/dev/') === false && fs !== 'zfs') continue
    mounts.push({ device, mount, fs })
  }
  return mounts
}

/**
 * Parse `df -kP` output into disk usage rows.
 * @param text - Full `df -kP` output.
 * @returns Usage rows in 1024-byte units converted to bytes.
 */
export function parseDf(text) {
  if (typeof text !== 'string') return null
  const rows = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const parts = line.split(/\s+/u)
    const percentIndex = parts.findIndex((part) => /^\d+%$/u.test(part))
    if (percentIndex < 4) continue
    const totalBlocks = Number(parts[percentIndex - 3])
    const usedBlocks = Number(parts[percentIndex - 2])
    const availableBlocks = Number(parts[percentIndex - 1])
    if (![totalBlocks, usedBlocks, availableBlocks].every((value) => Number.isFinite(value))) continue
    const device = parts.slice(0, percentIndex - 3).join(' ')
    const mount = parts.slice(percentIndex + 1).join(' ')
    if (device === '' || mount === '') continue
    rows.push({
      device,
      mount,
      totalBytes: totalBlocks * 1024,
      usedBytes: usedBlocks * 1024,
      availableBytes: availableBlocks * 1024,
    })
  }
  return rows
}

/**
 * Parse macOS `netstat -ib`, keeping the per-interface link-layer row.
 * @param text - Full `netstat -ib` output.
 * @returns Cumulative counters per interface.
 */
export function parseNetstatIb(text) {
  if (typeof text !== 'string') return null
  const counters = new Map()
  for (const raw of text.split('\n')) {
    const fields = raw.trim().split(/\s+/u)
    if (fields.length < 11) continue
    const address = fields[3]
    if (!/^[0-9a-f]{2}(?::[0-9a-f]{2}){5,7}$/iu.test(address)) continue
    const interfaceName = fields[0]
    const receivedBytes = toNumber(fields[6])
    const transmittedBytes = toNumber(fields[9])
    if (receivedBytes === null || transmittedBytes === null) continue
    const previous = counters.get(interfaceName)
    counters.set(interfaceName, {
      interface: interfaceName,
      receivedBytes: Math.max(previous?.receivedBytes ?? 0, receivedBytes),
      transmittedBytes: Math.max(previous?.transmittedBytes ?? 0, transmittedBytes),
    })
  }
  return counters.size === 0 ? null : Array.from(counters.values())
}

/**
 * Read the negotiated link speed out of macOS `ifconfig` output.
 * @param text - Full `ifconfig` output.
 * @returns Megabits per second or null.
 */
export function parseIfconfigMedia(text) {
  if (typeof text !== 'string') return null
  const match = /\((\d+)(G)?base/iu.exec(text)
  if (match === null) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  return match[2] === undefined ? value : value * 1000
}

/**
 * Choose the temperature rows the panel shows: CPU, GPU, NVMe, and board.
 * @param readings - Candidate readings `{chip, label, celsius}`.
 * @returns At most four normalized rows with a stable key.
 */
export function selectTemperatureSensors(readings) {
  const pool = (Array.isArray(readings) ? readings : []).filter((reading) => (
    reading !== null
    && typeof reading === 'object'
    && Number.isFinite(reading.celsius)
    && reading.celsius > -40
    && reading.celsius < 150
  ))
  const used = new Set()
  const take = (predicate) => {
    for (let index = 0; index < pool.length; index += 1) {
      if (used.has(index)) continue
      if (predicate(pool[index])) {
        used.add(index)
        return pool[index]
      }
    }
    return null
  }
  const chosen = []
  const add = (key, reading) => {
    if (reading === null) return
    chosen.push({
      key,
      label: typeof reading.label === 'string' && reading.label !== '' ? reading.label : null,
      celsius: Math.round(reading.celsius * 10) / 10,
    })
  }
  add('cpu', take((reading) => /^coretemp$/iu.test(reading.chip ?? '')
    && /package|tdie|tctl/iu.test(reading.label ?? ''))
    ?? take((reading) => /coretemp|k10temp|zenpower|cpu_thermal|soc_thermal/iu.test(reading.chip ?? ''))
    ?? take((reading) => /cpu|package/iu.test(reading.label ?? '')))
  add('gpu', take((reading) => /^(nvidia|amdgpu|nouveau|i915|xe)$/iu.test(reading.chip ?? ''))
    ?? take((reading) => /\bgpu\b/iu.test(reading.label ?? '')))
  add('nvme', take((reading) => /^nvme/iu.test(reading.chip ?? '') || /nvme/iu.test(reading.label ?? '')))
  add('board', take((reading) => /^(acpitz|nct\d+|it\d+|asus|gigabyte|msi|thinkpad|pch_)/iu.test(reading.chip ?? ''))
    ?? take((reading) => /board|motherboard|system|ambient/iu.test(reading.label ?? '')))
  if (chosen.length === 0) {
    for (let index = 0; index < pool.length && chosen.length < 4; index += 1) {
      if (used.has(index)) continue
      used.add(index)
      chosen.push({
        key: 'other',
        label: typeof pool[index].label === 'string' && pool[index].label !== '' ? pool[index].label : null,
        celsius: Math.round(pool[index].celsius * 10) / 10,
      })
    }
  }
  return chosen
}

/**
 * Choose one readable fan.
 * @param fans - Candidate fans `{chip, label, rpm, maxRpm}`.
 * @returns Normalized fan or null when no fan reports RPM.
 */
export function selectFanReading(fans) {
  const pool = (Array.isArray(fans) ? fans : []).filter((fan) => (
    fan !== null && typeof fan === 'object' && Number.isFinite(fan.rpm) && fan.rpm > 0
  ))
  if (pool.length === 0) return null
  const preferred = pool.find((fan) => /cpu|processor/iu.test(fan.label ?? ''))
    ?? pool.find((fan) => /nct|it87|coretemp|thinkpad|asus/iu.test(`${fan.chip ?? ''} ${fan.label ?? ''}`))
    ?? pool[0]
  return {
    key: 'fan',
    label: typeof preferred.label === 'string' && preferred.label !== '' ? preferred.label : null,
    rpm: Math.round(preferred.rpm),
    maxRpm: Number.isFinite(preferred.maxRpm) && preferred.maxRpm > 0 ? Math.round(preferred.maxRpm) : null,
  }
}

/**
 * Parse one line of `nvidia-smi --query-gpu`.
 * @param text - Command output; additional GPUs after the first line are ignored.
 * @returns GPU facts, or null when no name is present.
 */
export function parseNvidiaSmi(text) {
  if (typeof text !== 'string') return null
  const line = text.split('\n').map((row) => row.trim()).find((row) => row !== '')
  if (line === undefined) return null
  const cells = line.split(',').map((cell) => cell.trim())
  if (cells.length < 4) return null
  const [name, utilization, memoryUsed, memoryTotal, power, powerLimit, fan, temperature, driver, coreClock, memoryClock] = cells
  if (name === undefined || name === '') return null
  return {
    available: true,
    vendor: 'nvidia',
    name,
    usage: toPercent(utilization),
    memoryUsedBytes: mebibytes(memoryUsed),
    memoryTotalBytes: mebibytes(memoryTotal),
    powerWatts: toNumber(power),
    powerLimitWatts: toNumber(powerLimit),
    fanPercent: toPercent(fan),
    fanRpm: null,
    temperatureCelsius: toNumber(temperature),
    driverVersion: typeof driver === 'string' && driver !== '[N/A]' ? driver : null,
    cudaVersion: null,
    coreClockMhz: toNumber(coreClock),
    memoryClockMhz: toNumber(memoryClock),
    reason: null,
  }
}

/**
 * Read the CUDA and driver version lines from plain `nvidia-smi` output.
 * @param text - Full `nvidia-smi` report.
 * @returns Versions that were present.
 */
export function parseNvidiaSmiHeader(text) {
  if (typeof text !== 'string') return { cudaVersion: null, driverVersion: null }
  const cuda = /CUDA Version:\s*([0-9.]+)/u.exec(text)
  const driver = /Driver Version:\s*([0-9.]+)/u.exec(text)
  return {
    cudaVersion: cuda === null ? null : cuda[1],
    driverVersion: driver === null ? null : driver[1],
  }
}

/**
 * Parse `nvidia-smi --query-compute-apps=pid,used_memory`.
 * @param text - CSV rows emitted by the query.
 * @returns One GPU-memory row per compute process.
 */
export function parseNvidiaComputeApps(text) {
  if (typeof text !== 'string') return null
  const rows = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || /no running processes/iu.test(line)) continue
    const cells = line.split(',').map((cell) => cell.trim())
    const pid = toNumber(cells[0])
    const memory = mebibytes(cells[1])
    if (pid === null || memory === null) continue
    rows.push({ pid, memoryBytes: memory })
  }
  return rows
}

/**
 * Read the NVIDIA model from procfs when `nvidia-smi` cannot answer.
 * @param modelLine - Contents of a `/proc/driver/nvidia/gpus/<bus>/information` file.
 * @returns GPU facts, or null without a model.
 */
export function parseNvidiaProcInformation(modelLine) {
  if (typeof modelLine !== 'string') return null
  const match = /^Model:\s*(.+)$/mu.exec(modelLine)
  if (match === null) return null
  return {
    available: false,
    vendor: 'nvidia',
    name: match[1].trim(),
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
    reason: 'driver-unavailable',
  }
}

/**
 * Read the NVIDIA kernel-module version.
 * @param text - `/proc/driver/nvidia/version` contents.
 * @returns Version text or null.
 */
export function parseNvidiaProcVersion(text) {
  if (typeof text !== 'string') return null
  const module = /Kernel Module\s+([0-9.]+)/u.exec(text)
  if (module !== null) return module[1]
  const nvrm = /NVRM version:[^\n]*?(\d+\.\d+(?:\.\d+)?)/u.exec(text)
  return nvrm === null ? null : nvrm[1]
}

/**
 * Parse `ioreg -r -c IOAccelerator -d 1 -w 0`.
 * Each top-level entry is inspected separately, then the first entry with a
 * utilization counter wins; otherwise the first entry still supplies the model.
 * @param text - Full `ioreg` output.
 * @returns GPU facts, or null when the output lists no accelerator.
 */
export function parseIoregGpu(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  const blocks = text.split(/\n(?=\+-o\s)/u)
  const candidates = []
  for (const block of blocks) {
    const name = ioregGpuName(block)
    const usage = ioregGpuUsage(block)
    const ioClass = ioregIoClass(block)
    if (name === null && usage === null && ioClass === null) continue
    candidates.push({ name, usage, ioClass })
  }
  if (candidates.length === 0) return null
  const chosen = candidates.find((entry) => entry.usage !== null) ?? candidates[0]
  const name = chosen.name ?? prettyGpuClass(chosen.ioClass) ?? 'GPU'
  return {
    available: chosen.usage !== null,
    vendor: vendorOfName(name),
    name,
    usage: chosen.usage === null ? null : clampPercent(chosen.usage),
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
    reason: chosen.usage === null ? 'unsupported' : null,
  }
}

/**
 * Read the GPU model from one `ioreg` entry.
 * @param block - One top-level accelerator entry.
 * @returns Model name or null.
 */
function ioregGpuName(block) {
  const match = /"(?:model|Model)"\s*=\s*(?:"([^"]+)"|<"([^"]+)">)/u.exec(block)
  if (match === null) return null
  const name = (match[1] ?? match[2] ?? '').trim()
  return name === '' ? null : name
}

/**
 * Read `Device Utilization %` from one `ioreg` entry.
 * @param block - One top-level accelerator entry.
 * @returns Utilization or null.
 */
function ioregGpuUsage(block) {
  const match = /"Device Utilization %"\s*=\s*"?(\d+)/u.exec(block)
  if (match === null) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/**
 * Read the acceleration class from one `ioreg` entry.
 * @param block - One top-level accelerator entry.
 * @returns Class name or null.
 */
function ioregIoClass(block) {
  const property = /"IOClass"\s*=\s*"([^"]+)"/u.exec(block)
  const candidate = property !== null ? property[1] : /<class ([^,>]+)/u.exec(block)?.[1]?.trim()
  if (typeof candidate !== 'string' || candidate === '') return null
  return /accelerator|agx|radeon|intel|nvidia|nvk|gpu/iu.test(candidate) ? candidate : null
}

/**
 * Turn an accelerator class into a readable fallback model.
 * @param ioClass - Class name from `ioreg`.
 * @returns Display name or null.
 */
function prettyGpuClass(ioClass) {
  if (typeof ioClass !== 'string' || ioClass === '') return null
  if (/AGX|Apple/iu.test(ioClass)) return 'Apple GPU'
  if (/AMD|Radeon/iu.test(ioClass)) return 'AMD GPU'
  if (/Intel/iu.test(ioClass)) return 'Intel GPU'
  if (/NVIDIA|NVK/iu.test(ioClass)) return 'NVIDIA GPU'
  return ioClass
}

/**
 * Sum the block-storage byte counters from `ioreg` output.
 * @param text - Full `ioreg -r -c IOBlockStorageDriver` output.
 * @returns Cumulative bytes read and written, or null.
 */
export function parseIoregBlockStorage(text) {
  if (typeof text !== 'string') return null
  let readBytes = 0
  let writeBytes = 0
  let found = false
  for (const match of text.matchAll(/"Bytes \((Read|Write)\)"\s*=\s*(\d+)/gu)) {
    const value = Number(match[2])
    if (!Number.isFinite(value)) continue
    found = true
    if (match[1] === 'Read') readBytes += value
    else writeBytes += value
  }
  return found ? { readBytes, writeBytes } : null
}

/**
 * Read the active clock from an amdgpu `pp_dpm_*` table.
 * @param text - Contents of `pp_dpm_sclk` or `pp_dpm_mclk`.
 * @returns Megahertz or null.
 */
export function parseAmdClocks(text) {
  if (typeof text !== 'string') return null
  for (const line of text.split('\n')) {
    if (!line.includes('*')) continue
    const match = /(\d+)\s*Mhz/iu.exec(line)
    if (match !== null) return Number(match[1])
  }
  return null
}

/**
 * Parse `Win32_PerfFormattedData_PerfOS_Memory` style page-file usage JSON.
 * @param text - JSON object or array of page files.
 * @returns Summed page-file bytes, or null when no entry is usable.
 */
export function parsePageFileUsage(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  let totalMb = 0
  let usedMb = 0
  let found = false
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const total = toNumber(entry.AllocatedBaseSize)
    if (total === null) continue
    found = true
    totalMb += total
    usedMb += toNumber(entry.CurrentUsage) ?? 0
  }
  return found
    ? { totalBytes: Math.round(totalMb * 1024 * 1024), usedBytes: Math.round(usedMb * 1024 * 1024) }
    : null
}

/**
 * Recognize software display adapters that are not a physical GPU.
 * @param name - Adapter name.
 * @returns Whether the adapter should be ignored.
 */
function isVirtualAdapter(name) {
  return /microsoft basic display|microsoft basic render|microsoft remote display|hyper-v video|virtual display|indirect display|parsec|citrix|spacedesk/iu.test(name)
}

/**
 * Infer a vendor slug from a GPU model name.
 * @param name - Model name from any platform.
 * @returns Vendor slug or null.
 */
function vendorOfName(name) {
  if (typeof name !== 'string') return null
  if (/apple|agx/iu.test(name)) return 'apple'
  if (/nvidia|geforce|quadro|tesla/iu.test(name)) return 'nvidia'
  if (/amd|radeon|ati\b/iu.test(name)) return 'amd'
  if (/intel|iris|uhd|arc\b/iu.test(name)) return 'intel'
  return null
}

/**
 * Select one physical display adapter from `Win32_VideoController` entries.
 * @param entries - Parsed CIM entries.
 * @returns Unavailable GPU facts, or null when every adapter is virtual.
 */
export function selectVideoController(entries) {
  const candidates = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object') continue
    const name = typeof entry.Name === 'string' ? entry.Name.trim() : ''
    if (name === '' || isVirtualAdapter(name)) continue
    candidates.push({
      name,
      driverVersion: typeof entry.DriverVersion === 'string' && entry.DriverVersion !== ''
        ? entry.DriverVersion
        : null,
    })
  }
  if (candidates.length === 0) return null
  const chosen = candidates.find((candidate) => /nvidia|geforce|radeon|arc\b/iu.test(candidate.name))
    ?? candidates[0]
  return {
    available: false,
    vendor: vendorOfName(chosen.name),
    name: chosen.name,
    usage: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    powerWatts: null,
    powerLimitWatts: null,
    fanPercent: null,
    fanRpm: null,
    temperatureCelsius: null,
    driverVersion: chosen.driverVersion,
    cudaVersion: null,
    coreClockMhz: null,
    memoryClockMhz: null,
    reason: 'unsupported',
  }
}

/**
 * Parse `Win32_VideoController` JSON emitted by PowerShell.
 * @param text - JSON object or array with `Name` properties.
 * @returns Unavailable GPU facts, or null when every adapter is virtual.
 */
export function parseVideoControllers(text) {
  const entries = parseJsonEntries(text)
  return entries === null ? null : selectVideoController(entries)
}

/**
 * Parse Linux `/etc/os-release`.
 * @param text - File contents.
 * @returns Release fields or null without a product name.
 */
export function parseOsRelease(text) {
  if (typeof text !== 'string') return null
  const fields = {}
  for (const line of text.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/u.exec(line.trim())
    if (match === null) continue
    fields[match[1]] = match[2].replace(/^"(.*)"$/u, '$1')
  }
  const composed = [fields.NAME, fields.VERSION].filter((value) => typeof value === 'string' && value !== '').join(' ')
  const release = fields.PRETTY_NAME !== undefined && fields.PRETTY_NAME !== '' ? fields.PRETTY_NAME : composed
  return release === '' ? null : {
    release,
    name: fields.NAME ?? null,
    version: fields.VERSION_ID ?? fields.VERSION ?? null,
  }
}

/**
 * Parse macOS `sw_vers` output.
 * @param text - Full `sw_vers` output.
 * @returns Product release and build version.
 */
export function parseSwVers(text) {
  if (typeof text !== 'string') return null
  const fields = {}
  for (const line of text.split('\n')) {
    const match = /^([^:]+):\s*(.+)$/u.exec(line.trim())
    if (match !== null) fields[match[1].trim()] = match[2].trim()
  }
  const name = fields.ProductName ?? 'macOS'
  const version = fields.ProductVersion ?? ''
  const release = `${name} ${version}`.trim()
  if (version === '' && fields.ProductName === undefined) return null
  return { release, version: fields.BuildVersion ?? null }
}

/**
 * Parse macOS `system_profiler SPMemoryDataType` text.
 * @param text - Full text output.
 * @returns Type, module count, total capacity, and speed, or null.
 */
export function parseSystemProfilerMemory(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  const sizes = Array.from(text.matchAll(/^\s*Size:\s*([0-9.]+)\s*(GB|MB|TB)\s*$/gimu))
  if (sizes.length === 0) return null
  let totalBytes = 0
  for (const match of sizes) {
    const value = Number(match[1])
    if (!Number.isFinite(value)) continue
    const unit = match[2].toUpperCase()
    const factor = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit]
    totalBytes += Math.round(value * factor)
  }
  if (totalBytes === 0) return null
  const type = /^\s*Type:\s*(.+)$/imu.exec(text)?.[1]?.trim() ?? null
  const speedText = /^\s*Speed:\s*([0-9.]+)\s*(MT\/s|MHz)/imu.exec(text)?.[1]
  const speedMhz = speedText === undefined ? null : toNumber(speedText)
  return { type, count: sizes.length, totalBytes, speedMhz }
}

/**
 * Parse the Windows `Win32_OperatingSystem` summary.
 * @param text - JSON object or array.
 * @returns Display release and version string, or null.
 */
export function parseWindowsOsInfo(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const entry = entries.find((candidate) => candidate !== null && typeof candidate === 'object')
  if (entry === undefined) return null
  const caption = typeof entry.Caption === 'string' ? entry.Caption.replace(/^Microsoft\s+/u, '').trim() : ''
  const version = typeof entry.Version === 'string' ? entry.Version.trim() : ''
  const build = typeof entry.BuildNumber === 'string' ? entry.BuildNumber.trim() : ''
  const release = caption !== '' ? caption : version !== '' ? `Windows ${version}` : null
  if (release === null) return null
  return { release, version: version !== '' ? version : build !== '' ? build : null }
}

/**
 * Parse the Windows `Win32_Processor` summary.
 * @param text - JSON object or array.
 * @returns Model, core counts, and current clock, or null.
 */
export function parseWindowsCpuInfo(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const entry = entries.find((candidate) => candidate !== null && typeof candidate === 'object')
  if (entry === undefined) return null
  const cores = toNumber(entry.NumberOfCores)
  const threads = toNumber(entry.NumberOfLogicalProcessors)
  const currentFrequencyMhz = toNumber(entry.CurrentClockSpeed)
  const maxFrequencyMhz = toNumber(entry.MaxClockSpeed)
  const frequencyMhz = currentFrequencyMhz ?? maxFrequencyMhz
  const name = typeof entry.Name === 'string' ? entry.Name.trim() : null
  return {
    name: name === '' ? null : name,
    cores: cores !== null && cores > 0 ? cores : null,
    threads: threads !== null && threads > 0 ? threads : null,
    frequencyMhz,
    currentFrequencyMhz,
    maxFrequencyMhz,
  }
}

/**
 * Parse `Win32_PhysicalMemory` into a memory-spec summary.
 * @param text - JSON object or array.
 * @returns Type, module count, total capacity, and speed, or null.
 */
export function parseWindowsMemoryModules(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  let totalBytes = 0
  let count = 0
  let type = null
  let speedMhz = null
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const capacity = toNumber(entry.Capacity)
    if (capacity === null || capacity <= 0) continue
    totalBytes += capacity
    count += 1
    if (type === null) {
      const typeId = toNumber(entry.SMBIOSMemoryType) ?? toNumber(entry.MemoryType)
      type = typeId === null ? null : MEMORY_TYPES[typeId] ?? null
    }
    if (speedMhz === null) speedMhz = toNumber(entry.ConfiguredClockSpeed) ?? toNumber(entry.Speed)
  }
  return count === 0 ? null : { type, count, totalBytes, speedMhz }
}

/**
 * Parse `Win32_LogicalDisk` into disk-usage rows.
 * @param text - JSON object or array.
 * @returns Rows with byte totals and mount labels.
 */
export function parseWindowsDisks(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const disks = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const id = typeof entry.DeviceID === 'string' ? entry.DeviceID.trim() : ''
    const total = toNumber(entry.Size)
    const free = toNumber(entry.FreeSpace)
    if (id === '' || total === null || free === null || total <= 0) continue
    disks.push({
      device: id,
      mount: id,
      label: typeof entry.VolumeName === 'string' && entry.VolumeName !== '' ? entry.VolumeName : null,
      fs: typeof entry.FileSystem === 'string' && entry.FileSystem !== '' ? entry.FileSystem : null,
      totalBytes: total,
      usedBytes: Math.max(0, total - free),
      availableBytes: Math.max(0, free),
    })
  }
  return disks
}

/**
 * Parse the Windows perf-counter process payload.
 * @param text - JSON `{processes: [...]}` or a bare array.
 * @returns Process totals and the top CPU users.
 */
export function parseWindowsProcesses(text) {
  const parsed = parseJsonValue(text)
  if (parsed === null) return null
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.processes)
      ? parsed.processes
      : []
  const processes = []
  let threads = 0
  for (const entry of rows) {
    if (entry === null || typeof entry !== 'object') continue
    const rawName = typeof entry.Name === 'string' ? entry.Name.replace(/#\d+$/u, '').trim() : ''
    const pid = toNumber(entry.IDProcess)
    if (rawName === '' || pid === null) continue
    if (/^(?:powershell|pwsh|conhost|nvidia-smi|wmiprvse)(?:\.exe)?$/iu.test(rawName)) continue
    const threadCount = toNumber(entry.ThreadCount)
    if (threadCount !== null && threadCount > 0) threads += threadCount
    processes.push({
      name: rawName,
      pid,
      user: null,
      cpuPercent: toNumber(entry.PercentProcessorTime) ?? 0,
      memoryBytes: toNumber(entry.WorkingSet) ?? null,
      gpuMemoryBytes: null,
    })
  }
  processes.sort((left, right) => right.cpuPercent - left.cpuPercent || (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0))
  return {
    total: processes.length,
    threads: threads > 0 ? threads : null,
    top: processes.slice(0, 8),
  }
}

/**
 * Parse the Windows `Get-NetAdapter`/statistics payload.
 * @param text - JSON object or array of adapter rows.
 * @returns Adapter names, link speed, and cumulative byte counters.
 */
export function parseWindowsNetwork(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const adapters = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const name = typeof entry.name === 'string' ? entry.name.trim() : typeof entry.Name === 'string' ? entry.Name.trim() : ''
    if (name === '') continue
    const bits = toNumber(entry.linkSpeedBits)
    const speed = bits !== null && bits > 0 ? bits / 1e6 : linkSpeedFromText(entry.linkSpeed)
    adapters.push({
      interface: name,
      description: typeof entry.description === 'string' ? entry.description : null,
      linkSpeedMbps: speed,
      receivedBytes: toNumber(entry.receivedBytes),
      transmittedBytes: toNumber(entry.transmittedBytes),
    })
  }
  return adapters.length === 0 ? null : adapters
}

/**
 * Read a link speed out of a Windows `LinkSpeed` string such as `2.5 Gbps`.
 * @param text - Human-readable speed.
 * @returns Megabits per second or null.
 */
export function linkSpeedFromText(text) {
  if (typeof text !== 'string') return null
  const match = /([0-9.]+)\s*([GMK])?bps/iu.exec(text)
  if (match === null) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (match[2] ?? '').toUpperCase()
  const factor = unit === 'G' ? 1000 : unit === 'K' ? 0.001 : 1
  return Math.round(value * factor * 10) / 10
}

/**
 * Parse Windows network perf counters when adapter statistics are unavailable.
 * @param text - JSON object or array with `BytesReceivedPersec` fields.
 * @returns Rate-only adapter rows.
 */
export function parseWindowsPerfNetwork(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const adapters = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const name = typeof entry.Name === 'string' ? entry.Name.trim() : ''
    if (name === '') continue
    adapters.push({
      interface: name,
      description: null,
      linkSpeedMbps: null,
      receivedBytes: null,
      transmittedBytes: null,
      downBytesPerSecond: toNumber(entry.BytesReceivedPersec),
      upBytesPerSecond: toNumber(entry.BytesSentPersec),
    })
  }
  return adapters.length === 0 ? null : adapters
}

/**
 * Parse ACPI thermal-zone readings (tenths of a Kelvin).
 * @param text - JSON object or array.
 * @returns Temperature readings suitable for `selectTemperatureSensors`.
 */
export function parseWindowsThermalZones(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const readings = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = toNumber(entry.CurrentTemperature) ?? toNumber(entry.HighPrecisionTemperature)
    if (raw === null || raw <= 0) continue
    const celsius = raw / 10 - 273.15
    if (!Number.isFinite(celsius) || celsius <= -40 || celsius >= 150) continue
    const label = typeof entry.InstanceName === 'string' && entry.InstanceName !== ''
      ? entry.InstanceName.split('\\').filter(Boolean).pop()
      : typeof entry.Name === 'string' && entry.Name !== '' ? entry.Name : 'ACPI'
    readings.push({ chip: 'acpi', label, celsius })
  }
  return readings
}

/**
 * Parse `Win32_Fan` readings.
 * @param text - JSON object or array.
 * @returns Fan readings suitable for `selectFanReading`.
 */
export function parseWindowsFans(text) {
  const entries = parseJsonEntries(text)
  if (entries === null) return null
  const fans = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const rpm = toNumber(entry.DesiredSpeed) ?? toNumber(entry.CurrentSpeed)
    if (rpm === null || rpm <= 0) continue
    fans.push({
      chip: 'acpi',
      label: typeof entry.DeviceID === 'string' ? entry.DeviceID.split('\\').filter(Boolean).pop() : null,
      rpm,
      maxRpm: null,
    })
  }
  return fans
}

/**
 * Parse the output of `ps` with `pid user %cpu rss comm` columns.
 * @param text - Full `ps` output, with or without a header.
 * @returns One process per line.
 */
export function parsePsProcesses(text) {
  if (typeof text !== 'string') return null
  const processes = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const match = /^(\d+)\s+(\S+)\s+([0-9.]+)\s+(\d+)\s+(.+)$/u.exec(line)
    if (match === null) continue
    const rawName = match[5].trim()
    const name = rawName.startsWith('/') ? rawName.replace(/^.*\//u, '') : rawName
    if (name === '') continue
    processes.push({
      name,
      pid: Number(match[1]),
      user: match[2],
      cpuPercent: Number(match[3]),
      memoryBytes: Number(match[4]) * 1024,
      gpuMemoryBytes: null,
    })
  }
  return processes.length === 0 ? null : processes
}

/**
 * Read the total kernel scheduling entities from `/proc/loadavg`.
 * @param text - Full `/proc/loadavg` contents.
 * @returns Total thread count or null.
 */
export function parseLoadThreads(text) {
  if (typeof text !== 'string') return null
  const match = /\s(\d+)\/(\d+)\s/u.exec(` ${text.trim()} `)
  if (match === null) return null
  const total = Number(match[2])
  return Number.isFinite(total) && total > 0 ? total : null
}
