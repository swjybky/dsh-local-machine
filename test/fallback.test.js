/**
 * Regression test for the original macOS failure: metric collection must not
 * depend on Linux procfs. Patching `process.platform` keeps this runnable on
 * every OS, where the foreign probes fail and the portable fallbacks answer.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { readSnapshot } from '../lib/platform.js'

test('readSnapshot degrades gracefully without Linux procfs', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
  try {
    const snapshot = await readSnapshot()
    assert.equal(snapshot.platform, 'darwin')
    assert.equal(snapshot.os.name, 'macOS')
    assert.ok(snapshot.cpu.cores > 0)
    assert.ok(Array.isArray(snapshot.cpu.perCore))
    assert.equal(snapshot.cpu.perCore.length, snapshot.cpu.threads)
    assert.ok(snapshot.memory !== null)
    assert.ok(snapshot.memory.totalBytes > 0)
    assert.equal(typeof snapshot.memory.usage, 'number')
    assert.ok(snapshot.memory.usage >= 0 && snapshot.memory.usage <= 100)
    assert.equal(typeof snapshot.gpu.available, 'boolean')
    assert.ok(Array.isArray(snapshot.disks))
    assert.ok(Array.isArray(snapshot.sensors))
  } finally {
    if (descriptor !== undefined) Object.defineProperty(process, 'platform', descriptor)
  }
})
