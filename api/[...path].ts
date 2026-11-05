import type { IncomingMessage, ServerResponse } from 'node:http'

/** Keep browser requests same-origin; SQLite and the clock live on the durable API host. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = process.env.API_ORIGIN
  if (!origin) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'API_ORIGIN is not configured on Vercel.' }))
    return
  }
  try {
    const base = new URL(origin)
    if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
      throw new Error('API_ORIGIN must be an HTTPS origin without a path or credentials.')
    }
    // Use the original path, never a user-controlled destination URL.
    const incoming = new URL(req.url ?? '/', 'https://proxy.invalid')
    if (!incoming.pathname.startsWith('/api/')) {
      res.writeHead(404).end()
      return
    }
    const target = new URL(base.origin)
    target.pathname = incoming.pathname
    target.search = incoming.search
    const headers = new Headers()
    for (const name of ['authorization', 'content-type', 'accept', 'origin']) {
      const value = req.headers[name]
      if (typeof value === 'string') headers.set(name, value)
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk)
      size += buffer.length
      if (size > 100 * 1024) {
        res.writeHead(413).end(JSON.stringify({ error: 'Request body too large.' }))
        return
      }
      chunks.push(buffer)
    }
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    })
    res.statusCode = response.status
    res.setHeader('Cache-Control', 'no-store')
    for (const name of ['content-type', 'retry-after']) {
      const value = response.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('[proxy] API request failed', error)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'The API is temporarily unavailable.' }))
  }
}
