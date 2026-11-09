/**
 * Host half of the Local machine bundle.
 *
 * Samples CPU, memory, and GPU utilization on this machine and serves one
 * JSON snapshot to the Client panel at `/local-machine/metrics`. The Client
 * half only renders; every value here is read fresh per request.
 */
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { cpus, loadavg } from 'node:os'

export const inject = ['webServer']

/** Snapshot route consumed by the Client panel. */
const ROUTE_PATH = '/local-machine/metrics'
/** Below this gap two /proc/stat reads share too much idle time to be meaningful. */
const CPU_MIN_WINDOW_MS = 200
/** `nvidia-smi` is a probe, not a service: never let it hold the request open. */
const NVIDIA_SMI_TIMEOUT_MS = 1500
/** One GPU probe per window; repeated refreshes reuse it. */
const GPU_CACHE_MS = 2000

/** Previous /proc/stat reading and the shared in-flight CPU measurement. */
let previousCpu = null
let pendingCpu = null
/** Last GPU probe and its timestamp. */
let gpuCache = { at: 0, value: null }
/** CPU model name never changes while the process runs. */
let cpuModel = null

/**
 * Register the snapshot route as one effect of this plugin.
 * @param ctx - Host root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: (req, res) => handleMetrics(ctx, req, res),
  }), `local-machine: GET ${ROUTE_PATH}`)
}

/**
 * Answer one snapshot request behind the connection trust fence.
 * @param ctx - Host root context.
 * @param req - Incoming request.
 * @param res - Server response.
 */
async function handleMetrics(ctx, req, res) {
  if (rejectUntrusted(ctx, req, res)) return
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('allow', 'GET')
    res.end()
    return
  }
  try {
    sendJson(res, 200, await readSnapshot())
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Apply the same admission rule the shipped Host routes use.
 * @param ctx - Host root context.
 * @param req - Incoming request.
 * @param res - Server response.
 * @returns Whether the request was rejected and answered.
 */
function rejectUntrusted(ctx, req, res) {
  const connection = ctx.get('connection')
  if (connection === undefined || typeof connection.requestRejection !== 'function') return false
  const rejection = connection.requestRejection(req)
  if (rejection === undefined || rejection === null || rejection === false) return false
  res.statusCode = typeof rejection === 'number' ? rejection : 403
  res.end()
  return true
}

/**
 * Read every metric once, concurrently where possible.
 * @returns The snapshot payload.
 */
async function readSnapshot() {
  const [cpuUsage, memory, gpu] = await Promise.all([readCpuUsage(), readMemory(), readGpu()])
  return {
    sampledAt: new Date().toISOString(),
    cpu: {
      usage: cpuUsage,
      cores: cpus().length,
      model: await readCpuModel(),
      load: loadavg()[0] ?? null,
    },
    memory,
    gpu,
  }
}

/**
 * Measure CPU utilization over a short window.
 * @returns Busy percentage (0-100), or null when the kernel counters did not move.
 */
async function readCpuUsage() {
  if (pendingCpu !== null) return pendingCpu
  pendingCpu = measureCpu().finally(() => {
    pendingCpu = null
  })
  return pendingCpu
}

/**
 * Take the two samples one utilization reading needs, reusing the previous one
 * when it is fresh enough.
 * @returns Busy percentage or null.
 */
async function measureCpu() {
  const first = await sampleCpu()
  const previous = previousCpu
  const gap = previous === null ? 0 : first.at - previous.at
  if (previous !== null && gap >= CPU_MIN_WINDOW_MS) {
    previousCpu = first
    return busyPercent(previous, first)
  }
  const wait = previous === null ? CPU_MIN_WINDOW_MS : Math.max(0, CPU_MIN_WINDOW_MS - gap)
  if (wait > 0) await delay(wait)
  const next = await sampleCpu()
  previousCpu = next
  return busyPercent(previous ?? first, next)
}

/**
 * Read one aggregate line of `/proc/stat`.
 * @returns Tick counters and their sampling time.
 */
async function sampleCpu() {
  const text = await readFile('/proc/stat', 'utf8')
  const line = text.split('\n', 1)[0] ?? ''
  const fields = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  const total = fields.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
  return { idle, total, at: Date.now() }
}

/**
 * Difference of two CPU samples as a busy percentage.
 * @param previous - Earlier sample.
 * @param next - Later sample.
 * @returns Busy percentage or null without elapsed ticks.
 */
function busyPercent(previous, next) {
  const total = next.total - previous.total
  const idle = next.idle - previous.idle
  if (!(total > 0)) return null
  return clampPercent(((total - idle) / total) * 100)
}

/**
 * Read memory totals from `/proc/meminfo`.
 * @returns Used, total, and available memory facts.
 */
async function readMemory() {
  const text = await readFile('/proc/meminfo', 'utf8')
  const values = {}
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)(?:\s+kB)?\s*$/.exec(line)
    if (match !== null) values[match[1]] = Number(match[2]) * 1024
  }
  const total = values.MemTotal ?? null
  const available = values.MemAvailable ?? null
  const used = total !== null && available !== null ? Math.max(0, total - available) : null
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: used,
    usage: used !== null && total !== null && total > 0 ? clampPercent((used / total) * 100) : null,
    swapTotalBytes: values.SwapTotal ?? null,
    swapUsedBytes: values.SwapTotal !== undefined && values.SwapFree !== undefined
      ? Math.max(0, values.SwapTotal - values.SwapFree)
      : null,
  }
}

/**
 * CPU model name from `/proc/cpuinfo`, cached for the process lifetime.
 * @returns Model name or null.
 */
async function readCpuModel() {
  if (cpuModel !== null) return cpuModel
  const text = await readFile('/proc/cpuinfo', 'utf8').catch(() => '')
  const match = /^model name\s*:\s*(.+)$/m.exec(text)
  cpuModel = match === null ? '' : match[1].trim()
  return cpuModel === '' ? null : cpuModel
}

/**
 * Probe the GPU, reusing a recent probe result.
 * @returns GPU facts; `available: false` carries the reason.
 */
async function readGpu() {
  if (gpuCache.value !== null && Date.now() - gpuCache.at < GPU_CACHE_MS) return gpuCache.value
  const value = (await probeNvidia()) ?? (await probeAmd()) ?? (await describeMissingGpu())
  gpuCache = { at: Date.now(), value }
  return value
}

/**
 * Query NVIDIA hardware through `nvidia-smi`.
 * @returns GPU facts, or null when the tool or driver is unavailable.
 */
async function probeNvidia() {
  const output = await execFileText('nvidia-smi', [
    '--query-gpu=name,utilization.gpu,memory.used,memory.total',
    '--format=csv,noheader,nounits',
  ], NVIDIA_SMI_TIMEOUT_MS)
  if (output === null) return null
  const line = output.split('\n').map((row) => row.trim()).find((row) => row !== '')
  if (line === undefined) return null
  const [name, utilization, memoryUsed, memoryTotal] = line.split(',').map((cell) => cell.trim())
  if (name === undefined || name === '') return null
  return {
    available: true,
    vendor: 'nvidia',
    name,
    usage: toPercent(utilization),
    memoryUsedBytes: mebibytes(memoryUsed),
    memoryTotalBytes: mebibytes(memoryTotal),
    reason: null,
  }
}

/**
 * Read AMD utilization counters from sysfs.
 * @returns GPU facts, or null when no amdgpu device publishes them.
 */
async function probeAmd() {
  const cards = await readdir('/sys/class/drm').catch(() => [])
  for (const card of cards.filter((entry) => /^card\d+$/.test(entry)).sort()) {
    const device = `/sys/class/drm/${card}/device`
    const utilization = await readTextFile(`${device}/gpu_busy_percent`)
    if (utilization === null) continue
    const name = (await readTextFile(`${device}/product_name`)) ?? 'AMD GPU'
    return {
      available: true,
      vendor: 'amd',
      name,
      usage: toPercent(utilization),
      memoryUsedBytes: toNumber(await readTextFile(`${device}/mem_info_vram_used`)),
      memoryTotalBytes: toNumber(await readTextFile(`${device}/mem_info_vram_total`)),
      reason: null,
    }
  }
  return null
}

/**
 * Describe a GPU the runtime cannot measure: the model is still worth showing.
 * @returns Unavailable GPU facts with a reason.
 */
async function describeMissingGpu() {
  const directories = await readdir('/proc/driver/nvidia/gpus').catch(() => [])
  for (const directory of directories) {
    const information = await readTextFile(`/proc/driver/nvidia/gpus/${directory}/information`)
    const match = information === null ? null : /^Model:\s*(.+)$/m.exec(information)
    if (match !== null) {
      return { available: false, vendor: 'nvidia', name: match[1].trim(), usage: null, memoryUsedBytes: null, memoryTotalBytes: null, reason: 'driver-unavailable' }
    }
  }
  return { available: false, vendor: null, name: null, usage: null, memoryUsedBytes: null, memoryTotalBytes: null, reason: 'not-detected' }
}

/**
 * Run one bounded, non-interactive command and collect stdout.
 * @param command - Executable name or absolute path.
 * @param args - Command arguments.
 * @param timeoutMs - Hard limit; the child is killed past it.
 * @returns Stdout text, or null on any failure.
 */
function execFileText(command, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024 }, (error, stdout) => {
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
  return text === null ? null : text.trim()
}

/**
 * Parse a numeric cell.
 * @param value - Text cell.
 * @returns Finite number or null.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse a utilization cell into a clamped percentage.
 * @param value - Text cell.
 * @returns Percentage or null (for example `[N/A]`).
 */
function toPercent(value) {
  const parsed = toNumber(typeof value === 'string' ? value.replace(/[%\s]/g, '') : value)
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
 * Clamp a percentage into its display range.
 * @param value - Raw percentage.
 * @returns Value within 0-100.
 */
function clampPercent(value) {
  return Math.min(100, Math.max(0, value))
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
 * Write one JSON response.
 * @param res - Server response.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}
