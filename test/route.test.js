/**
 * Route contract for the Host half: `GET /local-machine/metrics` answers with
 * one JSON snapshot, and other methods stay rejected.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

/**
 * Register the plugin against the smallest Host context the route needs.
 * @returns The captured route handler.
 */
function routeHandler() {
  let handler
  apply({
    effect: (register) => register(),
    webServer: {
      register: (route) => {
        handler = route.handler
        return () => {}
      },
    },
    get: () => undefined,
  })
  assert.equal(typeof handler, 'function')
  return handler
}

/**
 * Minimal response double that records the JSON body.
 * @returns Response-like object.
 */
function responseDouble() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
    },
  }
}

test('GET /local-machine/metrics returns a snapshot', async () => {
  const handler = routeHandler()
  const res = responseDouble()
  await handler({ method: 'GET' }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  const payload = JSON.parse(res.body)
  assert.equal(payload.schemaVersion, 3)
  assert.equal(typeof payload.sampledAt, 'string')
  assert.equal(payload.platform, process.platform)
  assert.equal(typeof payload.os.name, 'string')
  assert.ok(payload.cpu.cores > 0)
  assert.ok(Array.isArray(payload.cpu.perCore))
  assert.equal(payload.cpu.perCore.length, payload.cpu.threads)
  assert.ok(payload.memory.totalBytes > 0)
  assert.equal(typeof payload.gpu.available, 'boolean')
  assert.ok(Array.isArray(payload.disks))
  assert.ok(Array.isArray(payload.sensors))
  assert.ok(payload.network === null || typeof payload.network.interface === 'string')
  assert.ok(payload.processes === null || Array.isArray(payload.processes.top))
  assert.equal(typeof payload.harness.available, 'boolean')
  assert.equal(payload.harness.pid, process.pid)
  assert.ok(Array.isArray(payload.harness.processes))
  assert.ok(Array.isArray(payload.harness.sessions))
  assert.equal(typeof payload.harness.host.heap.usedBytes, 'number')
})

test('other methods are rejected with 405', async () => {
  const handler = routeHandler()
  const res = responseDouble()
  await handler({ method: 'POST' }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
  assert.equal(res.body, '')
})
