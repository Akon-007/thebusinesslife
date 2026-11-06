import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import handler, { upstreamUrl } from '../../api/proxy'

test('Vercel explicitly routes nested API URLs before the SPA fallback', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  assert.deepEqual(config.rewrites[0], { source: '/api/:path*', destination: '/api/proxy?__path=:path*' })
  assert.ok(config.functions['api/proxy.ts'])
})

test('rewrite preserves the backend path and public query, not the internal routing key', () => {
  assert.equal(upstreamUrl('https://backend.example', '/api/proxy?__path=auth/login').href, 'https://backend.example/api/auth/login')
  assert.equal(upstreamUrl('https://backend.example', '/api/proxy?__path=world/feed&page=2').href, 'https://backend.example/api/world/feed?page=2')
  assert.equal(upstreamUrl('https://backend.example', '/api/health').href, 'https://backend.example/api/health')
  assert.throws(() => upstreamUrl('https://backend.example/api', '/api/health'))
  assert.throws(() => upstreamUrl('https://backend.example', '/api/proxy?__path=../login'))
})

test('proxy forwards login body/auth and makes infrastructure failures diagnosable', async (t) => {
  const oldOrigin = process.env.API_ORIGIN
  process.env.API_ORIGIN = 'https://backend.example'
  const realFetch = globalThis.fetch
  let upstreamStatus = 200
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith('https://backend.example/')) return realFetch(input, init)
    assert.equal(url, 'https://backend.example/api/auth/login')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token')
    assert.equal(String(init?.body), JSON.stringify({ email: 'test@example.test', password: 'test-password' }))
    return upstreamStatus === 200
      ? new Response(JSON.stringify({ token: 'test-session' }), { headers: { 'Content-Type': 'application/json' } })
      : new Response('<html>Not Found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })
  })
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const request = () => realFetch(`http://127.0.0.1:${address.port}/api/proxy?__path=auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify({ email: 'test@example.test', password: 'test-password' }),
  })
  try {
    const response = await request()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-businesslife-proxy'), '1')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { token: 'test-session' })
    upstreamStatus = 404
    const missing = await request()
    assert.equal(missing.status, 502)
    assert.match((await missing.json() as { error: string }).error, /API_ORIGIN/)
    delete process.env.API_ORIGIN
    assert.equal((await request()).status, 503)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (oldOrigin === undefined) delete process.env.API_ORIGIN
    else process.env.API_ORIGIN = oldOrigin
  }
})
