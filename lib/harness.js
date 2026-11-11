/**
 * DeepSeek Harness process and session monitoring for the Local machine panel.
 *
 * The plugin runs *inside* the Harness Host process, so this module has two
 * independent sources of truth:
 *
 * - **The process tree** — the launcher, Electron main/renderer/GPU children,
 *   the bundled Host, and the tool subprocesses the Harness owns. Sampled from
 *   `ps` on Linux/macOS and CIM on Windows; on Linux every member is refined
 *   through procfs into instantaneous CPU, RSS, swap, block I/O, context
 *   switches, file descriptors, and connected peers.
 * - **The live session registry** — `ctx.sessions`, `ctx.agents`,
 *   `ctx.sessionProjections`, and `ctx.sessionPersistence` when the Host mounts
 *   them, so each session's hardware use is attributed to the processes it
 *   actually launched (they carry `DSH_SESSION_ID` in their environment)
 *   instead of guessed from a name.
 *
 * Every probe is best-effort: a missing service, tool, or counter removes that
 * value and never fails the snapshot.
 */

import { execFile } from 'node:child_process'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import {
  PS_TREE_COLUMNS,
  collectSocketInodes,
  parseElapsedSeconds,
  parseProcIo,
  parseProcNetSockets,
  parseProcStatus,
  parsePsTree,
  selectDshProcessTree,
} from './parsers.js'

/** Cache window for the whole harness block; process probes are not free. */
const HARNESS_CACHE_MS = 900
/** Two samples must be at least this far apart to produce a rate. */
const MIN_WINDOW_MS = 250
/** An older sample is replaced instead of compared. */
const MAX_REUSE_MS = 30_000
/** Hard limit for one native probe. */
const PROBE_TIMEOUT_MS = 2000
/** PowerShell start-up is slower than a native probe. */
const POWERSHELL_TIMEOUT_MS = 4000
/** Bounded `ps` output; a huge argument list is treated as a failed probe. */
const PS_MAX_BUFFER = 4 * 1024 * 1024
/** Busiest threads reported for the Host process and for tool subprocesses. */
const TOP_THREADS = 8
/** Live sessions described in one snapshot. */
const MAX_SESSIONS = 16
/** Roles whose socket tables are worth resolving (the rest would double I/O). */
const SOCKET_ROLES = new Set(['host', 'main', 'renderer', 'utility', 'subprocess', 'terminal'])
/** Default Linux tick rate when `getconf` cannot answer. */
const DEFAULT_CLK_TCK = 100

/** Cumulative counters kept between samples to derive per-second figures. */
const processSample = { platform: null, at: 0, ticks: new Map(), readBytes: new Map(), writeBytes: new Map() }
/** Host thread CPU counters between samples. */
const threadSample = { platform: null, at: 0, ticks: new Map() }
/** Session log sizes between samples. */
const sessionSample = { platform: null, at: 0, bytes: new Map() }
/** Cached harness block plus the shared in-flight probe. */
let cache = { platform: null, at: 0, value: null, pending: null }
/** Event-loop monitor, created on first use and kept for the process lifetime. */
let loopDelay = null
/** Linux clock ticks per second, resolved once. */
let clockTicks = null

/**
 * Read the harness block, reusing a recent probe and coalescing concurrent
 * readers.
 * @param ctx - Host context, or null when no DSH services are reachable.
 * @param options - Per-snapshot inputs, such as an NVIDIA PID-to-VRAM map.
 * @returns The harness block; `available: false` carries a reason instead.
 */
export async function readHarness(ctx, options = {}) {
  const platform = process.platform
  if (cache.platform === platform && cache.value !== null && Date.now() - cache.at < HARNESS_CACHE_MS) {
    return cache.value
  }
  if (cache.pending !== null) return cache.pending
  const promise = probeHarness(ctx, options).then((value) => {
    cache = { platform, at: Date.now(), value, pending: null }
    return value
  }, (error) => {
    cache = { platform: null, at: 0, value: null, pending: null }
    throw error
  })
  cache = { ...cache, pending: promise }
  return promise
}

/**
 * Run one fresh harness probe.
 * @param ctx - Host context, or null.
 * @param options - Per-snapshot inputs.
 * @returns The normalized harness block.
 */
async function probeHarness(ctx, options) {
  const sampledAt = new Date().toISOString()
  const host = hostProcessDetail()
  const [sessions, tree] = await Promise.all([
    readSessions(ctx).catch(() => []),
    readProcessTree(options).catch(() => null),
  ])
  host.threads = await readHostThreads().catch(() => ({ available: false, count: null, top: [] }))
  if (tree === null || tree.members.length === 0) {
    return {
      available: false,
      reason: 'not-detected',
      sampledAt,
      pid: process.pid,
      attribution: process.platform === 'linux' ? 'environment' : 'heuristic',
      host,
      root: null,
      processes: [],
      totals: emptyTotals(),
      sessions: sessions.map((session) => sessionBlock(session, [], options)),
      reasonDetail: 'no harness process matched',
    }
  }
  const members = attributeSessions(tree.members, sessions)
  const processes = members.map((member) => describeProcess(member, options))
  const bySession = new Map()
  for (const entry of processes) {
    if (entry.sessionId === null) continue
    const list = bySession.get(entry.sessionId)
    if (list === undefined) bySession.set(entry.sessionId, [entry])
    else list.push(entry)
  }
  // A live session with no attributed process still belongs in the list, so the
  // panel can show "no work running" instead of silently dropping the session.
  const blocks = sessions.map((session) => sessionBlock(session, bySession.get(session.id) ?? [], options))
  for (const [sessionId, list] of bySession) {
    if (sessions.some((session) => session.id === sessionId)) continue
    blocks.push(sessionBlock({ id: sessionId, title: null, cwd: null, running: null, live: false }, list, options))
  }
  await attachSessionStorage(ctx, blocks).catch(() => {})
  return {
    available: true,
    reason: null,
    reasonDetail: null,
    sampledAt,
    pid: process.pid,
    attribution: process.platform === 'linux' ? 'environment' : 'heuristic',
    root: {
      pid: tree.root.pid,
      name: tree.root.name,
      role: tree.root.role,
      command: clip(tree.root.command, 240),
    },
    host,
    processes,
    totals: sumProcesses(processes),
    sessions: blocks,
  }
}

/**
 * Normalize one attributed member into the wire shape the panel renders.
 * @param member - Enriched tree member.
 * @param options - Per-snapshot inputs.
 * @returns Process row.
 */
function describeProcess(member, options) {
  const vram = options.gpuMemoryByPid
  return {
    pid: member.pid,
    ppid: member.ppid,
    role: member.role ?? 'other',
    name: member.name,
    command: clip(member.command, 240),
    cpuPercent: finiteOrNull(member.cpuPercent),
    memoryBytes: finiteOrNull(member.memoryBytes),
    swapBytes: finiteOrNull(member.swapBytes),
    threads: finiteOrNull(member.threads),
    uptimeSeconds: finiteOrNull(member.uptimeSeconds),
    state: member.state ?? null,
    sessionId: member.sessionId ?? null,
    isHost: member.isSelf === true,
    readBytesPerSecond: finiteOrNull(member.readBytesPerSecond),
    writeBytesPerSecond: finiteOrNull(member.writeBytesPerSecond),
    fileDescriptors: finiteOrNull(member.fileDescriptors),
    socketCount: finiteOrNull(member.socketCount),
    voluntaryContextSwitches: finiteOrNull(member.voluntaryContextSwitches),
    involuntaryContextSwitches: finiteOrNull(member.involuntaryContextSwitches),
    peers: Array.isArray(member.peers) ? member.peers : null,
    gpuMemoryBytes: vram instanceof Map ? finiteOrNull(vram.get(member.pid)) : null,
  }
}

/**
 * Read the process tree this harness owns.
 * @param options - Optional executable hint.
 * @returns The tree with per-process detail, or null when absent.
 */
async function readProcessTree(options) {
  if (process.platform === 'win32') return await readWindowsTree(options)
  if (process.platform !== 'linux' && process.platform !== 'darwin') return null
  const rows = await readUnixTree()
  if (rows === null) return null
  const tree = selectDshProcessTree(rows, {
    selfPid: process.pid,
    argv0: typeof options.argv0 === 'string' ? options.argv0 : undefined,
  })
  if (tree === null || tree.members.length === 0) return null
  if (process.platform === 'linux') {
    const enriched = await enrichLinuxTree(tree)
    if (enriched !== null) return enriched
  }
  return {
    root: tree.root,
    members: tree.members.map((member) => ({
      ...member,
      uptimeSeconds: parseElapsedSeconds(member.etime),
      sessionId: null,
    })),
  }
}

/**
 * Read the harness rows from `ps`.
 * @returns Parsed rows, or null when `ps` fails.
 */
async function readUnixTree() {
  const columns = process.platform === 'darwin'
    ? PS_TREE_COLUMNS.replace(',nlwp=', ',')
    : PS_TREE_COLUMNS
  const text = await execText('ps', ['-A', '-ww', '-o', columns], PROBE_TIMEOUT_MS, PS_MAX_BUFFER)
  return text === null ? null : parsePsTree(text, { withThreads: process.platform !== 'darwin' })
}

/**
 * Refine the Linux tree through procfs: instantaneous CPU, RSS, swap, block
 * I/O, sockets, and the session id carried by each process environment.
 * @param tree - Tree selected from `ps` rows.
 * @returns The enriched tree, or null when the sample cannot be compared.
 */
async function enrichLinuxTree(tree) {
  const ticks = await clkTck()
  const at = Date.now()
  const previous = processSample.platform === 'linux'
    && at - processSample.at >= MIN_WINDOW_MS
    && at - processSample.at <= MAX_REUSE_MS ? processSample : null
  const elapsed = previous === null ? 0 : at - processSample.at
  const netTexts = await readProcNetTexts()
  const nextTicks = new Map()
  const nextRead = new Map()
  const nextWrite = new Map()
  const members = await Promise.all(tree.members.map(async (member) => {
    const detail = await readLinuxProcess(member)
    const priorTicks = previous?.ticks.get(member.pid)
    const priorRead = previous?.readBytes.get(member.pid)
    const priorWrite = previous?.writeBytes.get(member.pid)
    const sockets = detail.inodes.size > 0 && SOCKET_ROLES.has(member.role)
      ? parseProcNetSockets(netTexts, detail.inodes)
      : null
    if (detail.ticks !== null) nextTicks.set(member.pid, detail.ticks)
    if (detail.io !== null) {
      nextRead.set(member.pid, detail.io.readBytes)
      nextWrite.set(member.pid, detail.io.writeBytes)
    }
    return {
      ...member,
      cpuPercent: detail.ticks !== null && priorTicks !== undefined && elapsed > 0
        ? clampRate(((detail.ticks - priorTicks) / ticks / (elapsed / 1000)) * 100)
        : member.cpuPercent,
      memoryBytes: detail.vmRssBytes ?? member.memoryBytes,
      swapBytes: detail.vmSwapBytes,
      threads: detail.threads ?? member.threads,
      uptimeSeconds: parseElapsedSeconds(member.etime),
      state: detail.state ?? member.state,
      sessionId: detail.sessionId,
      readBytesPerSecond: detail.io !== null && priorRead !== undefined && elapsed > 0
        ? ratePerSecond(detail.io.readBytes, priorRead, elapsed)
        : null,
      writeBytesPerSecond: detail.io !== null && priorWrite !== undefined && elapsed > 0
        ? ratePerSecond(detail.io.writeBytes, priorWrite, elapsed)
        : null,
      voluntaryContextSwitches: detail.voluntaryContextSwitches,
      involuntaryContextSwitches: detail.involuntaryContextSwitches,
      fileDescriptors: detail.fileDescriptors,
      socketCount: sockets === null ? (detail.inodes.size === 0 ? 0 : null) : sockets.count,
      peers: sockets?.peers ?? null,
    }
  }))
  processSample.platform = 'linux'
  processSample.at = at
  processSample.ticks = nextTicks
  processSample.readBytes = nextRead
  processSample.writeBytes = nextWrite
  return { root: members[0], members }
}

/**
 * Read one `/proc/<pid>` description, including the `DSH_SESSION_ID` entry of
 * its environment when present.
 * @param member - Parsed `ps` row.
 * @returns Detail fields; unknown values are null.
 */
async function readLinuxProcess(member) {
  const base = `/proc/${member.pid}`
  const [statText, statusText, ioText, environText, fds] = await Promise.all([
    readTextFile(`${base}/stat`),
    readTextFile(`${base}/status`),
    readTextFile(`${base}/io`),
    readFile(`${base}/environ`, 'utf8').catch(() => null),
    readdir(`${base}/fd`).catch(() => null),
  ])
  const stat = parseProcStatLine(statText)
  const status = statusText === null ? null : parseProcStatus(statusText)
  const io = ioText === null ? null : parseProcIo(ioText)
  return {
    ticks: stat?.ticks ?? null,
    threads: status?.threads ?? stat?.threads ?? null,
    state: status?.state ?? stat?.state ?? null,
    vmRssBytes: status?.vmRssBytes ?? null,
    vmSwapBytes: status?.vmSwapBytes ?? null,
    voluntaryContextSwitches: status?.voluntaryContextSwitches ?? null,
    involuntaryContextSwitches: status?.involuntaryContextSwitches ?? null,
    io,
    inodes: fds === null ? new Set() : collectSocketInodes(await readLinkTargets(member.pid, fds)),
    fileDescriptors: fds === null ? null : fds.length,
    sessionId: environText === null ? null : sessionIdFromEnviron(environText),
  }
}

/**
 * Read the `DSH_SESSION_ID` fact out of a NUL-separated environment block.
 * @param text - Full `/proc/<pid>/environ` contents.
 * @returns Session id or null.
 */
function sessionIdFromEnviron(text) {
  if (typeof text !== 'string' || text === '') return null
  for (const entry of text.split('\0')) {
    if (!entry.startsWith('DSH_SESSION_ID=')) continue
    const value = entry.slice('DSH_SESSION_ID='.length).trim()
    return value === '' ? null : value
  }
  return null
}

/**
 * Read the `/proc/<pid>/stat` fields this module needs.
 * @param text - Full stat contents.
 * @returns CPU ticks, thread count, and state, or null.
 */
function parseProcStatLine(text) {
  if (typeof text !== 'string' || text === '') return null
  const close = text.lastIndexOf(')')
  if (close < 0) return null
  const fields = text.slice(close + 2).trim().split(/\s+/u)
  // After the command field, index 0 is state (field 3); utime is field 14.
  const utime = Number(fields[11])
  const stime = Number(fields[12])
  if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null
  const threads = Number(fields[17])
  return {
    state: fields[0],
    ticks: utime + stime,
    threads: Number.isFinite(threads) ? threads : null,
  }
}

/**
 * Resolve the socket inodes of one process's file descriptors.
 * @param pid - Target pid.
 * @param fds - Directory entries under `/proc/<pid>/fd`.
 * @returns Readable link targets.
 */
async function readLinkTargets(pid, fds) {
  const targets = await Promise.all(fds.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => null)))
  return targets.filter((target) => target !== null)
}

/**
 * Read the network-namespace TCP tables once per sample.
 * @returns Table text keyed by family.
 */
async function readProcNetTexts() {
  const [tcp, tcp6] = await Promise.all([
    readTextFile(`/proc/${process.pid}/net/tcp`),
    readTextFile(`/proc/${process.pid}/net/tcp6`),
  ])
  return { tcp, tcp6 }
}

/**
 * Read and reset the Host's per-thread CPU counters from `/proc/self/task`.
 * @returns Thread block with the busiest threads, or an unavailable block.
 */
async function readHostThreads() {
  if (process.platform !== 'linux') return { available: false, count: null, top: [] }
  const entries = await readdir('/proc/self/task').catch(() => null)
  if (entries === null) return { available: false, count: null, top: [] }
  const ticks = await clkTck()
  const at = Date.now()
  const previous = threadSample.platform === 'linux'
    && at - threadSample.at >= MIN_WINDOW_MS
    && at - threadSample.at <= MAX_REUSE_MS ? threadSample : null
  const elapsed = previous === null ? 0 : at - threadSample.at
  const rows = await Promise.all(entries.map(async (tid) => {
    const text = await readTextFile(`/proc/self/task/${tid}/stat`)
    const stat = parseProcStatLine(text)
    if (stat === null) return null
    const prior = previous?.ticks.get(Number(tid))
    return {
      tid: Number(tid),
      name: threadName(text) ?? 'thread',
      state: stat.state ?? null,
      cpuPercent: stat.ticks !== null && prior !== undefined && elapsed > 0
        ? clampRate(((stat.ticks - prior) / ticks / (elapsed / 1000)) * 100)
        : null,
      ticks: stat.ticks,
    }
  }))
  const threads = rows.filter((row) => row !== null)
  threadSample.platform = 'linux'
  threadSample.at = at
  threadSample.ticks = new Map(threads.map((row) => [row.tid, row.ticks]))
  return {
    available: true,
    count: threads.length,
    top: [...threads]
      .sort((left, right) => (right.cpuPercent ?? 0) - (left.cpuPercent ?? 0) || left.tid - right.tid)
      .slice(0, TOP_THREADS)
      .map(({ tid, name, state, cpuPercent }) => ({ tid, name, state, cpuPercent })),
  }
}

/**
 * Read a thread name out of its `/proc/.../stat` command field.
 * @param text - Full stat contents.
 * @returns Thread name or null.
 */
function threadName(text) {
  if (typeof text !== 'string') return null
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  return open < 0 || close <= open ? null : text.slice(open + 1, close)
}

/**
 * Resolve Linux's `CLK_TCK` once; it is 100 on nearly every build.
 * @returns Ticks per second.
 */
async function clkTck() {
  if (clockTicks !== null) return clockTicks
  const text = await execText('getconf', ['CLK_TCK'], PROBE_TIMEOUT_MS)
  const value = text === null ? Number.NaN : Number(text.trim())
  clockTicks = Number.isFinite(value) && value > 0 ? value : DEFAULT_CLK_TCK
  return clockTicks
}

/**
 * Read the Windows harness tree through CIM.
 * @param options - Optional executable hint (unused on Windows).
 * @returns Tree with per-process detail, or null.
 */
async function readWindowsTree() {
  const text = await execText('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    withUtf8PowerShell('$rows = Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | '
      + 'Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,ThreadCount,KernelModeTime,UserModeTime; '
      + '[pscustomobject]@{ processes = @($rows) } | ConvertTo-Json -Compress -Depth 4'),
  ], POWERSHELL_TIMEOUT_MS, PS_MAX_BUFFER)
  if (text === null) return null
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const all = Array.isArray(parsed?.processes) ? parsed.processes : parsed === null ? [] : [parsed]
  const byPid = new Map(all.map((row) => [Number(row.ProcessId), row]))
  const candidates = all.filter((row) => typeof row?.CommandLine === 'string'
    && /deepseek-harness|app\.asar|dsh-desktop-host/iu.test(row.CommandLine))
  if (candidates.length === 0) return null
  const rootRow = candidates.reduce((best, row) => (
    best === null || depthIn(byPid, row) < depthIn(byPid, best) ? row : best
  ), null)
  const at = Date.now()
  const previous = processSample.platform === 'win32'
    && at - processSample.at >= MIN_WINDOW_MS
    && at - processSample.at <= MAX_REUSE_MS ? processSample : null
  const elapsed = previous === null ? 0 : at - processSample.at
  const members = []
  const seen = new Set()
  const queue = [rootRow]
  while (queue.length > 0) {
    const row = queue.shift()
    const pid = Number(row.ProcessId)
    if (seen.has(pid)) continue
    seen.add(pid)
    const cpuSeconds = (Number(row.KernelModeTime ?? 0) + Number(row.UserModeTime ?? 0)) / 1e7
    const prior = previous?.ticks.get(pid)
    members.push({
      pid,
      ppid: Number(row.ParentProcessId),
      name: typeof row.Name === 'string' ? row.Name.replace(/\.exe$/iu, '') : 'process',
      command: typeof row.CommandLine === 'string' ? row.CommandLine : null,
      cpuPercent: prior !== undefined && elapsed > 0
        ? clampRate(((cpuSeconds - prior) / (elapsed / 1000)) * 100)
        : null,
      memoryBytes: Number(row.WorkingSetSize ?? 0) > 0 ? Number(row.WorkingSetSize) : null,
      threads: Number(row.ThreadCount ?? 0) > 0 ? Number(row.ThreadCount) : null,
      uptimeSeconds: null,
      state: null,
      isSelf: pid === process.pid,
      cpuTimeTicks: cpuSeconds,
    })
    for (const child of all) {
      if (Number(child.ParentProcessId) === pid) queue.push(child)
    }
  }
  processSample.platform = 'win32'
  processSample.at = at
  processSample.ticks = new Map(members.map((member) => [member.pid, member.cpuTimeTicks]))
  processSample.readBytes = new Map()
  processSample.writeBytes = new Map()
  const classified = members.map((member, index) => ({
    ...member,
    role: index === 0 ? 'main' : roleFromCommand(member.command),
  }))
  return { root: classified[0], members: classified }
}

/**
 * Count how far a Windows process sits from its topmost ancestor.
 * @param byPid - All CIM rows by pid.
 * @param row - Starting row.
 * @returns Ancestor depth, bounded against malformed cycles.
 */
function depthIn(byPid, row) {
  let depth = 0
  let current = row
  const seen = new Set([Number(row.ProcessId)])
  while (depth < 64) {
    const parent = byPid.get(Number(current?.ParentProcessId))
    if (parent === undefined || seen.has(Number(parent.ProcessId))) break
    seen.add(Number(parent.ProcessId))
    depth += 1
    current = parent
  }
  return depth
}

/**
 * Classify a Windows harness child by its command line.
 * @param command - Process command line.
 * @returns Role slug.
 */
function roleFromCommand(command) {
  const lower = typeof command === 'string' ? command.toLowerCase() : ''
  if (lower.includes('--type=renderer')) return 'renderer'
  if (lower.includes('--type=gpu')) return 'gpu'
  if (lower.includes('--type=utility')) {
    return lower.includes('dsh-desktop-host') || lower.includes('app.asar') ? 'host' : 'utility'
  }
  if (lower.includes('dsh-desktop-host')) return 'host'
  return 'other'
}

/**
 * Attach a session id to every member that carries one.
 * @param members - Tree members.
 * @param sessions - Live session rows used as a command-line fallback.
 * @returns The same members, with `sessionId` set when attributable.
 */
function attributeSessions(members, sessions) {
  for (const member of members) {
    if (typeof member.sessionId === 'string' && member.sessionId !== '') continue
    member.sessionId = matchSessionByCommand(member, sessions)
  }
  return members
}

/**
 * Fall back to matching a session's project directory inside a command line
 * when the environment is unavailable (macOS, Windows).
 * @param member - Tree member.
 * @param sessions - Live session rows.
 * @returns Session id or null.
 */
function matchSessionByCommand(member, sessions) {
  const command = typeof member.command === 'string' ? member.command : ''
  if (command === '') return null
  for (const session of sessions) {
    if (typeof session.cwd !== 'string' || session.cwd === '') continue
    if (command.includes(session.cwd)) return session.id
  }
  return null
}

/**
 * Build one session row from its identity, transcript facts, and attributed
 * processes.
 * @param session - Session identity and metadata.
 * @param processes - Attributed process rows.
 * @param options - Per-snapshot inputs.
 * @returns Normalized session row.
 */
function sessionBlock(session, processes, options) {
  const totals = sumProcesses(processes)
  const vram = options.gpuMemoryByPid
  let vramBytes = null
  if (vram instanceof Map) {
    for (const process of processes) {
      const value = vram.get(process.pid)
      if (typeof value === 'number' && Number.isFinite(value)) vramBytes = (vramBytes ?? 0) + value
    }
  }
  return {
    sessionId: session.id,
    title: session.title ?? null,
    cwd: session.cwd ?? null,
    running: session.running ?? null,
    live: session.live !== false,
    events: session.events ?? null,
    tokens: session.tokens ?? null,
    context: session.context ?? null,
    stats: session.stats ?? null,
    logBytes: session.logBytes ?? null,
    logBytesPerSecond: null,
    processCount: totals.processCount,
    threads: totals.threads,
    cpuPercent: totals.cpuPercent,
    memoryBytes: totals.memoryBytes,
    vramBytes,
    swapBytes: sumField(processes, 'swapBytes'),
    readBytesPerSecond: totals.readBytesPerSecond,
    writeBytesPerSecond: totals.writeBytesPerSecond,
    fileDescriptors: sumField(processes, 'fileDescriptors'),
    socketCount: sumField(processes, 'socketCount'),
    pids: processes.map((process) => process.pid),
  }
}

/**
 * Sum a numeric field over process rows.
 * @param rows - Process rows.
 * @param field - Field name.
 * @returns Sum, or null when no row reports it.
 */
function sumField(rows, field) {
  let total = 0
  let seen = false
  for (const row of rows) {
    const value = row?.[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

/**
 * Total one set of process rows.
 * @param processes - Process rows.
 * @returns Aggregate figures with null for unknown values.
 */
function sumProcesses(processes) {
  return {
    processCount: processes.length,
    cpuPercent: sumField(processes, 'cpuPercent'),
    memoryBytes: sumField(processes, 'memoryBytes'),
    threads: sumField(processes, 'threads'),
    readBytesPerSecond: sumField(processes, 'readBytesPerSecond'),
    writeBytesPerSecond: sumField(processes, 'writeBytesPerSecond'),
  }
}

/**
 * The empty totals block used when no harness process was found.
 * @returns Zeroed totals.
 */
function emptyTotals() {
  return {
    processCount: 0,
    cpuPercent: null,
    memoryBytes: null,
    threads: null,
    readBytesPerSecond: null,
    writeBytesPerSecond: null,
  }
}

/**
 * Describe the Host process itself: JavaScript heap, event-loop delay, active
 * handles, and CPU/context-switch accounting straight from V8 and libuv.
 * @returns Host detail block.
 */
function hostProcessDetail() {
  const memory = typeof process.memoryUsage === 'function' ? process.memoryUsage() : null
  const resources = typeof process.getActiveResourcesInfo === 'function'
    ? process.getActiveResourcesInfo()
    : null
  let usage = null
  try {
    usage = typeof process.resourceUsage === 'function' ? process.resourceUsage() : null
  } catch {
    usage = null
  }
  const byType = {}
  for (const name of resources ?? []) byType[name] = (byType[name] ?? 0) + 1
  return {
    pid: process.pid,
    name: 'dsh-host',
    uptimeSeconds: Math.round(process.uptime()),
    versions: {
      node: process.versions.node ?? null,
      electron: process.versions.electron ?? null,
      v8: process.versions.v8 ?? null,
    },
    heap: memory === null ? null : {
      usedBytes: finiteOrNull(memory.heapUsed),
      totalBytes: finiteOrNull(memory.heapTotal),
      rssBytes: finiteOrNull(memory.rss),
      externalBytes: finiteOrNull(memory.external),
      usage: memory.heapTotal > 0 ? clampPercent((memory.heapUsed / memory.heapTotal) * 100) : null,
    },
    eventLoop: readEventLoopDelay(),
    handles: resources === null ? null : { active: resources.length, byType },
    resourceUsage: usage === null ? null : {
      maxRssBytes: usage.maxRSS > 0 ? usage.maxRSS * 1024 : null,
      voluntaryContextSwitches: finiteOrNull(usage.voluntaryContextSwitches),
      involuntaryContextSwitches: finiteOrNull(usage.involuntaryContextSwitches),
      fsReads: finiteOrNull(usage.fsRead),
      fsWrites: finiteOrNull(usage.fsWrite),
      ipcSent: finiteOrNull(usage.ipcSent),
      ipcReceived: finiteOrNull(usage.ipcReceived),
    },
    threadPoolSize: finiteOrNull(process.env.UV_THREADPOOL_SIZE),
    threads: { available: false, count: null, top: [] },
  }
}

/**
 * Read and reset the event-loop delay histogram, so each snapshot describes the
 * interval since the previous one.
 * @returns Mean, p99, and max delay in milliseconds; unknown values are null.
 */
function readEventLoopDelay() {
  try {
    if (loopDelay === null) {
      loopDelay = monitorEventLoopDelay({ resolution: 20 })
      loopDelay.enable()
    }
    const samples = loopDelay.count
    if (samples === 0) return { meanMs: null, p99Ms: null, maxMs: null, samples: 0 }
    const value = {
      meanMs: nanosToMillis(loopDelay.mean),
      p99Ms: nanosToMillis(loopDelay.percentile(99)),
      maxMs: nanosToMillis(loopDelay.max),
      samples,
    }
    loopDelay.reset()
    return value
  } catch {
    return null
  }
}

/**
 * Read the live session registry through the Host services.
 * @param ctx - Host context, or null.
 * @returns Session rows; empty when the services are absent.
 */
async function readSessions(ctx) {
  if (ctx === null || ctx === undefined || typeof ctx.get !== 'function') return []
  const store = serviceOf(ctx, 'sessions')
  if (store === undefined || typeof store.list !== 'function') return []
  let live = []
  try {
    live = store.list()
  } catch {
    return []
  }
  if (!Array.isArray(live) || live.length === 0) return []
  const agents = serviceOf(ctx, 'agents')
  const projections = serviceOf(ctx, 'sessionProjections')
  const rows = []
  for (const session of live) {
    const id = typeof session?.id === 'string' ? session.id : session?.header?.id
    if (typeof id !== 'string' || id === '') continue
    const agent = agents !== undefined && typeof agents.get === 'function' ? agents.get(id) : undefined
    const values = projectionValues(projections, session)
    rows.push({
      id,
      title: titlesOf(values),
      cwd: typeof session?.header?.cwd === 'string' ? session.header.cwd : null,
      running: typeof agent?.status === 'string' ? agent.status === 'running' : null,
      live: true,
      events: typeof session?.seq === 'number' ? session.seq : null,
      tokens: tokenTotals(values),
      context: contextOf(values),
      stats: statsOf(values),
      logBytes: null,
    })
    if (rows.length >= MAX_SESSIONS) break
  }
  return rows
}

/**
 * Read one Host service without letting a missing service throw.
 * @param ctx - Host context.
 * @param name - Service name.
 * @returns The service, or undefined.
 */
function serviceOf(ctx, name) {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/**
 * Read the registered projection values for one live session.
 * @param registry - `ctx.sessionProjections`, when mounted.
 * @param session - Live Session.
 * @returns Projection values, or null.
 */
function projectionValues(registry, session) {
  if (registry === undefined || typeof registry.snapshot !== 'function') return null
  try {
    return registry.snapshot(session)?.values ?? null
  } catch {
    return null
  }
}

/**
 * Read the durable session title.
 * @param values - Projection values.
 * @returns Title text or null.
 */
function titlesOf(values) {
  const title = values?.title
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null
}

/**
 * Sum a session's recorded provider token usage.
 * @param values - Projection values.
 * @returns Token totals, or null before the first billed request.
 */
function tokenTotals(values) {
  const usage = values?.tokenUsage
  if (usage === null || typeof usage !== 'object') return null
  const input = finiteOrNull(usage.uncachedInputTokens)
  const output = finiteOrNull(usage.outputTokens)
  const cached = finiteOrNull(usage.cacheReadTokens)
  const written = finiteOrNull(usage.cacheWriteTokens)
  if (input === null && output === null && cached === null && written === null) return null
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cached,
    cacheWriteTokens: written,
    totalTokens: (input ?? 0) + (output ?? 0) + (cached ?? 0) + (written ?? 0),
  }
}

/**
 * Read the next request's context occupancy.
 * @param values - Projection values.
 * @returns Pressure and capacity, or null before the first usage report.
 */
function contextOf(values) {
  const pressure = values?.contextPressure
  if (pressure === null || typeof pressure !== 'object') return null
  const used = finiteOrNull(pressure.pressureTokens)
  const projected = finiteOrNull(pressure.projectedTokens)
  const window = finiteOrNull(pressure.contextWindow)
  if (used === null && projected === null && window === null) return null
  const effective = projected ?? used
  return {
    usedTokens: used,
    projectedTokens: projected,
    windowTokens: window,
    usage: window !== null && window > 0 && effective !== null ? clampPercent((effective / window) * 100) : null,
  }
}

/**
 * Read whole-log turn, step, and wall-time figures.
 * @param values - Projection values.
 * @returns Session stats, or null when the projection is not mounted.
 */
function statsOf(values) {
  const stats = values?.sessionStats
  if (stats === null || typeof stats !== 'object') return null
  return {
    turns: finiteOrNull(stats.turns),
    steps: finiteOrNull(stats.steps),
    llmMs: finiteOrNull(stats.llmMs),
    toolMs: finiteOrNull(stats.toolMs),
    ttftMs: finiteOrNull(stats.ttftMs),
    ttftSteps: finiteOrNull(stats.ttftSteps),
    decodeMs: finiteOrNull(stats.decodeMs),
    decodeTokens: finiteOrNull(stats.decodeTokens),
  }
}

/**
 * Attach durable log size and its growth rate to each live session row.
 * @param ctx - Host context.
 * @param rows - Session rows updated in place.
 */
async function attachSessionStorage(ctx, rows) {
  const persistence = serviceOf(ctx, 'sessionPersistence')
  if (persistence === undefined || typeof persistence.stat !== 'function') return
  const at = Date.now()
  const previous = sessionSample.platform === process.platform
    && at - sessionSample.at >= MIN_WINDOW_MS
    && at - sessionSample.at <= MAX_REUSE_MS ? sessionSample : null
  const elapsed = previous === null ? 0 : at - sessionSample.at
  const next = new Map()
  await Promise.all(rows.map(async (row) => {
    if (row.live !== true) return
    let snapshot = null
    try {
      snapshot = await persistence.stat(row.sessionId)
    } catch {
      return
    }
    if (snapshot === null || snapshot === undefined) return
    const size = finiteOrNull(snapshot.sizeBytes)
    if (size !== null && size >= 0) row.logBytes = size
    const count = finiteOrNull(snapshot.eventCount)
    if (count !== null && count >= 0 && row.events === null) row.events = count
    if (size === null) return
    const prior = previous?.bytes.get(row.sessionId)
    if (prior !== undefined && elapsed > 0) row.logBytesPerSecond = ratePerSecond(size, prior, elapsed)
    next.set(row.sessionId, size)
  }))
  sessionSample.platform = process.platform
  sessionSample.at = at
  sessionSample.bytes = next
}

/**
 * Convert cumulative CPU seconds into a percentage of one core.
 * @param seconds - CPU seconds consumed in the interval.
 * @param elapsedMs - Interval length.
 * @returns Percentage, never negative.
 */
function ratePercent(seconds, elapsedMs) {
  if (!Number.isFinite(seconds) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null
  return clampRate((seconds * 1000 / elapsedMs) * 100)
}

/**
 * Convert two cumulative byte counters into a per-second rate.
 * @param current - Later counter.
 * @param previous - Earlier counter.
 * @param elapsedMs - Interval length.
 * @returns Bytes per second, never negative.
 */
function ratePerSecond(current, previous, elapsedMs) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || elapsedMs <= 0) return null
  return Math.max(0, ((current - previous) * 1000) / elapsedMs)
}

/**
 * Keep a CPU-like rate inside its displayable range; a process tree of N
 * processes can legitimately exceed 100.
 * @param value - Raw percentage.
 * @returns Clamped percentage or null.
 */
function clampRate(value) {
  if (!Number.isFinite(value)) return null
  return Math.min(6400, Math.max(0, value))
}

/**
 * Convert nanoseconds to milliseconds.
 * @param value - Nanosecond duration.
 * @returns Milliseconds rounded to 0.01, or null.
 */
function nanosToMillis(value) {
  if (!Number.isFinite(value)) return null
  return Math.round((value / 1e6) * 100) / 100
}

/**
 * Clamp a percentage into its display range.
 * @param value - Raw percentage.
 * @returns Value within 0-100, or null.
 */
function clampPercent(value) {
  if (!Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

/**
 * Normalize a numeric value.
 * @param value - Raw value.
 * @returns Number or null.
 */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Bound a text field for the wire.
 * @param value - Raw text.
 * @param max - Maximum length.
 * @returns Clipped text or null.
 */
function clip(value, max) {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/**
 * Prefix a PowerShell script with the UTF-8 console setting.
 * @param script - PowerShell body.
 * @returns Command text.
 */
function withUtf8PowerShell(script) {
  return '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' + script
}

/**
 * Run one bounded command and collect stdout.
 * @param command - Executable name or path.
 * @param args - Arguments.
 * @param timeoutMs - Hard limit.
 * @param maxBuffer - Largest stdout accepted.
 * @returns Stdout text, or null on failure.
 */
function execText(command, args, timeoutMs, maxBuffer = 256 * 1024) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout) => {
      resolve(error === null ? String(stdout) : null)
    })
  })
}

/**
 * Read a small text file, treating absence as an expected answer.
 * @param path - Absolute path.
 * @returns Trimmed contents or null.
 */
async function readTextFile(path) {
  const text = await readFile(path, 'utf8').catch(() => null)
  return text === null ? null : text.replace(/\0/gu, '').trim()
}