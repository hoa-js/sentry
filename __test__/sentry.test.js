import { jest } from '@jest/globals'
import Hoa from 'hoa'

// Mock toucan-js for ESM/Jest
await jest.unstable_mockModule('toucan-js', () => {
  const Toucan = jest.fn().mockImplementation(function (opts) {
    this.setTag = jest.fn()
    this.captureException = jest.fn(() => {
      if (opts && opts.context) {
        const ctx = opts.context
        if (typeof ctx.passThroughOnException === 'function') ctx.passThroughOnException()
        if (typeof ctx.waitUntil === 'function') ctx.waitUntil(Promise.resolve())
      }
    })
    this.log = jest.fn()
  })
  return { Toucan }
})

const { sentry } = await import('../src/sentry.js')
const { Toucan } = await import('toucan-js')

describe('Sentry middleware for Hoa', () => {
  let app

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})

    app = new Hoa()

    // Inject routePath for /sentry/* to exercise http.route tagging
    app.use(async (ctx, next) => {
      if (ctx.req.pathname.startsWith('/sentry/')) {
        ctx.req.routePath = ctx.req.pathname
      }
      await next()
    })

    // Mount Sentry middleware for /sentry/* routes
    app.use(async (ctx, next) => {
      if (ctx.req.pathname.startsWith('/sentry/')) {
        return sentry()(ctx, next)
      }
      await next()
    })

    // Handlers
    app.use(async (ctx, next) => {
      if (ctx.req.pathname === '/sentry/foo') {
        ctx.res.body = 'foo'
        return
      }
      if (ctx.req.pathname === '/sentry/bar') {
        ctx.state.sentry.log('bar')
        ctx.res.body = 'bar'
        return
      }
      if (ctx.req.pathname === '/sentry/error') {
        throw new Error('a catastrophic error')
      }
      if (ctx.req.pathname === '/sentry/error-state') {
        ctx.state.requestId = 'state-456'
        throw new Error('state error')
      }
      if (ctx.req.pathname === '/sentry/error-no-route') {
        ctx.req.routePath = undefined
        throw new Error('no route error')
      }
      if (ctx.req.pathname === '/sentry/error-no-id') {
        // no requestId in state or headers
        throw new Error('no id error')
      }
      await next()
    })
  })

  // Test helper to reduce duplication
  async function fetchInst (path, { headers, env } = {}) {
    const req = new Request(`http://localhost${path}`, headers ? { headers } : undefined)
    const res = await app.fetch(req, env)
    expect(res).not.toBeNull()
    const inst = Toucan.mock.instances[Toucan.mock.instances.length - 1]
    expect(inst).toBeDefined()
    return { res, inst }
  }

  it('Should initialize Toucan', async () => {
    const { res } = await fetchInst('/sentry/foo', { env: { SENTRY_DSN: 'test-dsn' } })
    expect(res.status).toBe(200)
    expect(Toucan.mock.calls.length).toBeGreaterThan(0)
  })

  it('Should make Sentry available via context', async () => {
    const { res } = await fetchInst('/sentry/bar')
    expect(res.status).toBe(200)
    const anyLogged = Toucan.mock.instances.some(inst => inst.log.mock.calls.length > 0)
    expect(anyLogged).toBe(true)
  })

  it('Should report errors', async () => {
    const { res, inst } = await fetchInst('/sentry/error', {
      headers: { 'x-request-id': 'req-123', referer: 'http://example.com/ref' }
    })
    expect(res.status).toBe(500)

    // Exception captured
    expect(inst.captureException.mock.calls.length).toBeGreaterThan(0)
    // Tag assertions
    expect(inst.setTag).toHaveBeenCalledWith('http.method', 'GET')
    expect(inst.setTag).toHaveBeenCalledWith('http.url', '/sentry/error')
    expect(inst.setTag).toHaveBeenCalledWith('http.status_code', '500')
    expect(inst.setTag).toHaveBeenCalledWith('http.host', 'localhost')
    expect(inst.setTag).toHaveBeenCalledWith('http.referer', 'http://example.com/ref')
    expect(inst.setTag).toHaveBeenCalledWith('http.route', '/sentry/error')
    expect(inst.setTag).toHaveBeenCalledWith('request_id', 'req-123')
  })

  it('Should tag request_id from state and include route and url with query', async () => {
    const { res, inst } = await fetchInst('/sentry/error-state?q=1')
    expect(res.status).toBe(500)
    expect(inst.captureException.mock.calls.length).toBeGreaterThan(0)
    expect(inst.setTag).toHaveBeenCalledWith('request_id', 'state-456')
    expect(inst.setTag).toHaveBeenCalledWith('http.url', '/sentry/error-state?q=1')
    expect(inst.setTag).toHaveBeenCalledWith('http.route', '/sentry/error-state')
  })

  it('Should not set http.route when routePath is missing', async () => {
    const { res, inst } = await fetchInst('/sentry/error-no-route')
    expect(res.status).toBe(500)
    expect(inst.captureException.mock.calls.length).toBeGreaterThan(0)
    expect(inst.setTag).not.toHaveBeenCalledWith('http.route', expect.any(String))
  })

  it('Should not set request_id when none present', async () => {
    const { res, inst } = await fetchInst('/sentry/error-no-id')
    expect(res.status).toBe(500)
    expect(inst.captureException.mock.calls.length).toBeGreaterThan(0)
    // ensure no request_id tag was set
    const taggedRequestId = inst.setTag.mock.calls.some(call => call[0] === 'request_id')
    expect(taggedRequestId).toBe(false)
  })
})
