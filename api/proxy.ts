import type { IncomingMessage, ServerResponse } from 'node:http'

// Vercel parses JSON bodies before invoking Node handlers. Disable that parsing
// so the same raw-byte forwarding works on Vercel and with Node's HTTP server.
export const config = { api: { bodyParser: false } }

/** Resolve the explicit rewrite without forwarding its internal routing query. */
export function upstreamUrl(origin: string, requestUrl: string): URL {
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new Error('API_ORIGIN must be an HTTPS origin without a path or credentials.')
  }
  const incoming = new URL(requestUrl, 'https://proxy.invalid')
  const rewrittenPath = incoming.searchParams.get('__path')
  incoming.searchParams.delete('__path')
  const pathname = rewrittenPath === null ? incoming.pathname : `/api/${rewrittenPath}`
  if (!pathname.startsWith('/api/') || pathname.includes('\\') || pathname.split('/').some(p => p === '.' || p === '..')) {
    throw new Error('Invalid API request path.')
  }
  const target = new URL(base.origin)
  target.pathname = pathname
  target.search = incoming.searchParams.toString()
  return target
}

/** Same-origin gateway; SQLite and the clock stay on the durable API host. */
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Businesslife-Proxy', '1')
  const origin = process.env.API_ORIGIN
  if (!origin) {
    console.error('[proxy] API_ORIGIN is not configured')
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'API_ORIGIN is not configured on Vercel.' }))
    return
  }
  try {
    const target = upstreamUrl(origin, req.url ?? '/')
    const headers = new Headers()
    for (const name of ['authorization', 'content-type', 'accept', 'origin']) {
      const value = req.headers[name]
      if (typeof value === 'string') headers.set(name, value)
    }
    const chunks: Buffer[] = []
    let size = 0
    // Also support runtimes that supply an already-parsed body.
    if (req.body !== undefined) {
      const body = req.body
      chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      size = chunks[0].length
    } else {
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk)
        size += buffer.length
        if (size > 100 * 1024) break
        chunks.push(buffer)
      }
    }
    if (size > 100 * 1024) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Request body too large.' }))
      return
    }
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) {
      // Never log passwords, bodies, bearer tokens, or query parameters.
      console.error(`[proxy] ${req.method} ${target.pathname} upstream status=${response.status}`)
    }
    if (!contentType.includes('application/json')) {
      console.error(`[proxy] ${req.method} ${target.pathname} unexpected upstream content type; status=${response.status}`)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'The configured backend did not return an API response. Check API_ORIGIN and the backend deployment.' }))
      return
    }
    res.statusCode = response.status
    res.setHeader('Content-Type', contentType)
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) res.setHeader('Retry-After', retryAfter)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('[proxy] API request failed:', error instanceof Error ? error.message : 'Unknown error')
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'The API is temporarily unavailable. Check the backend deployment and API_ORIGIN.' }))
  }
}
