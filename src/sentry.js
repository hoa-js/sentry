import { Toucan } from 'toucan-js'

/**
 * Minimal mock for Cloudflare's ExecutionContext when not provided.
 */
class MockExecutionContext {
  passThroughOnException () {}
  async waitUntil (promise) { await promise }
}
const mockExecutionContext = new MockExecutionContext()

/**
 * Sentry middleware for Hoa.
 *
 * - Reads DSN from `ctx.env.SENTRY_DSN` (or `ctx.env.NEXT_PUBLIC_SENTRY_DSN`).
 * - Attaches the Toucan instance to `ctx.state.sentry`.
 * - Captures exceptions thrown by downstream middleware and rethrows them.
 *
 * @param {Object} [options] - Sentry options
 * @param {string} [options.dsn] - Sentry DSN; falls back to `ctx.env.SENTRY_DSN` or `ctx.env.NEXT_PUBLIC_SENTRY_DSN` when omitted.
 * @returns {HoaMiddleware}
 */
export const sentry = (options = {}) => {
  return async function sentryMiddleware (ctx, next) {
    const toucan = new Toucan({
      dsn: ctx.env?.SENTRY_DSN ?? ctx.env?.NEXT_PUBLIC_SENTRY_DSN,
      request: ctx.request,
      context: ctx.executionCtx ?? mockExecutionContext,
      ...options
    })

    // Expose Sentry on context state for downstream usage
    ctx.state.sentry = toucan

    try {
      await next()
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500
      toucan.setTag('http.status_code', String(status))
      toucan.setTag('http.method', ctx.req.method)
      toucan.setTag('http.url', `${ctx.req.pathname}${ctx.req.search}`)
      if (ctx.req.routePath) toucan.setTag('http.route', ctx.req.routePath)
      toucan.setTag('http.host', ctx.req.host)
      const referer = ctx.req.get('referer') || ctx.req.get('referrer')
      if (referer) toucan.setTag('http.referer', referer)
      const requestId = ctx.state.requestId || ctx.req.get('x-request-id')
      if (requestId) toucan.setTag('request_id', requestId)

      // Capture and rethrow to ensure default error handling still applies
      toucan.captureException(err)
      throw err
    }
  }
}

export default sentry
