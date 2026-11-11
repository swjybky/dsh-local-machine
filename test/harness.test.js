/**
 * Harness monitor contract: the pure parsers that read `ps`/procfs output and
 * the probe that assembles the harness block.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyDshRole,
  collectSocketInodes,
  parseElapsedSeconds,
  parseProcIo,
  parseProcNetSockets,
  parseProcStatus,
  parsePsThreads,
  parsePsTree,
  selectDshProcessTree,
} from '../lib/parsers.js'
import { readHarness } from '../lib/harness.js'

/** Realistic AppImage + Electron + Host + tool child rows. */
const TREE = [
  '  400   1 swj 0.2 18000 42 06:12:00 Sl /opt/deepseek-harness/deepseek-harness.AppImage --no-sandbox',
  '  401 400 swj 3.1 220000 60 06:10:00 Sl /tmp/.mount_dsh/deepseek-harness --type=gpu-process --gpu-preferences=x',
  '  402 400 swj 8.4 410000 90 06:10:00 Sl /tmp/.mount_dsh/deepseek-harness --type=renderer --enable-sandbox',
  '  403 400 swj 21.5 900000 300 06:10:00 Sl /tmp/.mount_dsh/deepseek-harness --type=utility --utility-sub-type=node.mojom.NodeService --app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js',
  '  404 403 swj 4.2 120000 12 00:51:05 Sl node /opt/dsh/dsh-subprocess-runner -- bash -lc npm test',
  '  405 403 swj 0.5 24000 3 00:05:11 Ss bash -lc pnpm --filter dsh-web run dev',
  '  900   1 swj 1.0 90000 5 1-02:00:00 Sl /usr/bin/firefox',
].join('\n')

test('parsePsTree reads identity, threads, and the command line', () => {
  const rows = parsePsTree(TREE)
  assert.equal(rows.length, 7)
  const host = rows.find((row) => row.pid === 403)
  assert.equal(host.ppid, 400)
  assert.equal(host.threads, 300)
  assert.equal(host.etime, '06:10:00')
  assert.equal(host.name, 'deepseek-harness')
  assert.match(host.command, /dsh-desktop-host/u)
  assert.equal(host.memoryBytes, 900000 * 1024)
  assert.equal(parsePsTree(''), null)
})

test('parsePsTree tolerates a missing thread-count column', () => {
  const rows = parsePsTree('  7   1 swj 0.0 1000 12:34 S /usr/bin/login -f swj', { withThreads: false })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].threads, null)
  assert.equal(rows[0].etime, '12:34')
  assert.equal(rows[0].state, 'S')
  assert.equal(rows[0].name, 'login')
  assert.equal(rows[0].command, '-f swj')
})

test('selectDshProcessTree scopes the tree to the harness root', () => {
  const tree = selectDshProcessTree(parsePsTree(TREE), { selfPid: 403 })
  assert.equal(tree.root.pid, 400)
  assert.equal(tree.root.role, 'main')
  assert.deepEqual(tree.members.map((row) => row.pid).sort((left, right) => left - right), [400, 401, 402, 403, 404, 405])
  const byPid = new Map(tree.members.map((row) => [row.pid, row]))
  assert.equal(byPid.get(401).role, 'gpu')
  assert.equal(byPid.get(402).role, 'renderer')
  assert.equal(byPid.get(403).role, 'host')
  assert.equal(byPid.get(403).isSelf, true)
  assert.equal(byPid.get(404).role, 'subprocess')
  assert.equal(byPid.get(405).role, 'other')
  assert.equal(tree.members.some((row) => row.pid === 900), false)
  assert.equal(selectDshProcessTree([], {}), null)
  // Without a self PID the same tree is still selected, just with no self mark.
  const anonymous = selectDshProcessTree(parsePsTree(TREE))
  assert.equal(anonymous.root.pid, 400)
  assert.equal(anonymous.members.some((row) => row.isSelf), false)
})

test('selectDshProcessTree falls back to the reader pid when no command matches', () => {
  // A hardened sandbox can hide every command line, leaving no harness marker
  // for the normal candidate scan. The Host half knows its own pid, so the
  // tree is still scoped to the reader instead of reporting "not-detected".
  const opaque = [
    '  700   1 swj 0.3 18000 42 06:12:00 Sl node',
    '  701 700 swj 2.0 220000 60 06:10:00 Sl node',
    '  702 701 swj 9.0 410000 90 06:10:00 Sl node',
  ].join('\n')
  const tree = selectDshProcessTree(parsePsTree(opaque), { selfPid: 702 })
  assert.equal(tree.root.pid, 702)
  assert.deepEqual(tree.members.map((row) => row.pid), [702])
  // The anchor is the reader itself, never an ancestor: climbing would drag the
  // launcher and anything it owns into a tree this probe cannot vouch for.
  assert.equal(tree.members.some((row) => row.pid === 700), false)
})

test('classifyDshRole recognises each harness child role', () => {
  const role = (command, name = 'node') => classifyDshRole({ name, command })
  assert.equal(role('/opt/x.asar.unpacked/dsh/lib/index.js'), 'host')
  assert.equal(role('x --type=renderer'), 'renderer')
  assert.equal(role('x --type=gpu-process'), 'gpu')
  assert.equal(role('x --type=utility --utility-sub-type=audio'), 'utility')
  assert.equal(role('x --type=zygote'), 'utility')
  assert.equal(role('node /opt/dsh/dsh-subprocess-runner -- bash'), 'subprocess')
  assert.equal(role('bash -lc node-pty'), 'terminal')
  assert.equal(role('/usr/bin/firefox', 'firefox'), null)
  assert.equal(classifyDshRole({ name: 'deepseek-harness', command: '' }, true), 'main')
})

test('parseElapsedSeconds decodes ps durations', () => {
  assert.equal(parseElapsedSeconds('12:34'), 754)
  assert.equal(parseElapsedSeconds('01:02:03'), 3723)
  assert.equal(parseElapsedSeconds('2-03:04:05'), 183_845)
  assert.equal(parseElapsedSeconds(''), null)
  assert.equal(parseElapsedSeconds(null), null)
})

test('parseProcStatus and parseProcIo read kernel counters', () => {
  const status = parseProcStatus([
    'Name:\tdsh-host',
    'State:\tS (sleeping)',
    'Pid:\t4242',
    'PPid:\t1',
    'VmSize:\t  900000 kB',
    'VmRSS:\t  120000 kB',
    'VmSwap:\t    2048 kB',
    'Threads:\t41',
    'voluntary_ctxt_switches:\t120',
    'nonvoluntary_ctxt_switches:\t7',
  ].join('\n'))
  assert.equal(status.name, 'dsh-host')
  assert.equal(status.pid, 4242)
  assert.equal(status.threads, 41)
  assert.equal(status.vmRssBytes, 120000 * 1024)
  assert.equal(status.vmSwapBytes, 2048 * 1024)
  assert.equal(status.voluntaryContextSwitches, 120)
  assert.equal(parseProcStatus('garbage'), null)
  const io = parseProcIo('rchar: 10\nwchar: 20\nsyscr: 2\nsyscw: 3\n')
  assert.deepEqual(io, { readBytes: 10, writeBytes: 20, readSyscalls: 2, writeSyscalls: 3 })
  assert.equal(parseProcIo(''), null)
})

test('parseProcNetSockets maps inodes to established peers', () => {
  const tcp = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:1F90 0100007F:D431 01 00000000:00000000 00:00000000 00000000  1000        0 5551 1',
    '   1: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5552 1',
    '   2: 0100007F:1F90 0A00020F:0050 01 00000000:00000000 00:00000000 00000000  1000        0 5553 1',
  ].join('\n')
  const sockets = parseProcNetSockets({ tcp }, new Set(['5551', '5552', '5553']))
  assert.equal(sockets.count, 3)
  assert.equal(sockets.peers.length, 2)
  assert.deepEqual(sockets.peers[0], { protocol: 'tcp', remoteHost: '127.0.0.1', remotePort: 54321, localPort: 8080 })
  assert.equal(sockets.peers[1].remoteHost, '15.2.0.10')
  assert.equal(parseProcNetSockets({ tcp }, new Set()), null)
})

test('collectSocketInodes keeps only socket descriptors', () => {
  const inodes = collectSocketInodes(['socket:[42]', '/dev/null', 'pipe:[7]', 'socket:[43]'])
  assert.deepEqual([...inodes], ['42', '43'])
  assert.equal(collectSocketInodes([]).size, 0)
})

test('parsePsThreads groups thread rows by owner', () => {
  const rows = parsePsThreads([
    ' 4030  4030 12.5 Rl node',
    ' 4030  4031  0.3 Sl node-V8Worker',
    ' 4040  4040  1.0 Ss bash',
  ].join('\n'))
  assert.equal(rows.length, 3)
  assert.equal(rows[0].pid, 4030)
  assert.equal(rows[0].tid, 4030)
  assert.equal(rows[1].state, 'Sl')
  assert.equal(rows[1].name, 'node-V8Worker')
  assert.equal(parsePsThreads(''), null)
})

test('readHarness reports the host runtime without a Host context', async () => {
  const harness = await readHarness(null, {})
  assert.equal(typeof harness.available, 'boolean')
  assert.equal(harness.pid, process.pid)
  assert.equal(typeof harness.host.heap.usedBytes, 'number')
  assert.equal(typeof harness.host.uptimeSeconds, 'number')
  assert.ok(Array.isArray(harness.sessions))
  assert.ok(harness.totals !== null)
  if (!harness.available) {
    assert.equal(harness.reason, 'not-detected')
    assert.deepEqual(harness.processes, [])
  }
})