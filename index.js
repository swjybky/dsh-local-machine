/**
 * Host half of the Local machine bundle.
 *
 * Serves one cross-platform snapshot of CPU, memory, GPU, and — when the Host
 * exposes them — the DeepSeek Harness process tree and live sessions, to the
 * Client panel at `/local-machine/metrics`. Sampling lives in
 * `lib/platform.js` and `lib/harness.js`; this file only owns the route and its
 * admission checks.
 */
import { readSnapshot } from './lib/platform.js'

export const inject = ['webServer']

/** Snapshot route consumed by the Client panel. */
const ROUTE_PATH = '/local-machine/metrics'

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
    // The Harness blocks read the Host's own services, so the snapshot needs
    // the live context rather than a bare process probe.
    sendJson(res, 200, await readSnapshot({ context: ctx, argv0: process.env.ARGV0 }))
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
