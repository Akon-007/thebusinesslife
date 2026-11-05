import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { CORS_ORIGINS, IS_DEV, NODE_ENV } from './config'
import { requireAuth, requireRole } from './middleware'
import { authRateLimit, verifyRateLimit, writeRateLimit } from './ratelimit'
import { ensureClock } from './clock'
import { ensureSimulationDefaults } from './simulation'
import authRoutes from './routes/auth'
import playerRoutes from './routes/player'
import playerCompanyRoutes from './routes/playerCompany'
import adminRoutes from './routes/admin'
import lecturerRoutes from './routes/lecturer'
import worldFeedRoutes from './routes/worldFeed'

/**
 * BUSINESSLIFE API.
 *
 * Four audiences share one backend and one database. Access is decided per
 * route by role, so a player token cannot reach an administrator's data, and
 * a lecturer can only ever see the classes they own.
 *
 * The application is built here, separate from `index.ts`, so the test suite
 * can import it and exercise the real routes without opening a port.
 */

// The simulation must always be in a defined state: an administrator's
// settings, rules, regulations and events are seeded once and edited from
// there. Idempotent, so it is safe to call on every boot.
ensureSimulationDefaults()

// The world clock is created here too, so the first read of the simulation
// state always returns a defined instant. Starting the tick loop is deferred
// to `index.ts` so tests can import the routes without a timer underneath them.
ensureClock()

export const app = express()

app.disable('x-powered-by')

/**
 * CORS.
 *
 * When `CORS_ORIGINS` is set, only those origins may call the API from a
 * browser. When it is unset we fall back to reflecting any origin, which is
 * what a local development server needs; production is expected to set it.
 * Requests without an Origin header (native apps, server-to-server, curl) are
 * always allowed.
 */
app.use(cors(CORS_ORIGINS.length > 0 ? { origin: CORS_ORIGINS } : { origin: true }))

app.use(express.json({ limit: '100kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: NODE_ENV })
})

// Sign-in, registration and code requests are the cheapest surface to attack,
// so they carry the tightest limit; verification is limited separately because
// it is also a guessing surface.
app.use('/api/auth', authRateLimit, verifyRateLimit, authRoutes)

// Read-only world settings. Public by design: the city is seeded before a
// player signs in, and this carries configuration only, never personal data.
app.use('/api/world', worldFeedRoutes)

// The player's company — its ledger, stock, orders and invoices. Mounted
// before the general player area so `/api/player/company` is matched here.
// The write limit applies to the whole surface: almost everything here changes
// the books, and a read burst is cheap to absorb.
app.use(
  '/api/player/company',
  writeRateLimit,
  requireAuth,
  requireRole('PLAYER'),
  playerCompanyRoutes,
)

// Player-only area.
app.use('/api/player', writeRateLimit, requireAuth, requireRole('PLAYER'), playerRoutes)

// Administrator area. The role is enforced here, once, for every admin route.
app.use('/api/admin', writeRateLimit, requireAuth, requireRole('ADMIN'), adminRoutes)

// Lecturer area. Ownership of each class is enforced inside the routes, so a
// lecturer can only read and write the classes, students and assignments that
// belong to them.
app.use(
  '/api/lecturer',
  writeRateLimit,
  requireAuth,
  requireRole('LECTURER'),
  lecturerRoutes,
)

// Unmatched API paths.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  console.error('[api] unhandled error:', error)
  res.status(500).json({ error: IS_DEV ? message : 'Unexpected server error.' })
})

export interface ServerHandle {
  url: string
  close: () => Promise<void>
}

/** Starts the API on an ephemeral (or given) port. Used by the test suite. */
export function startServer(port = 0): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const address = server.address()
      const actual = typeof address === 'object' && address ? address.port : port
      resolve({
        url: `http://127.0.0.1:${actual}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}
