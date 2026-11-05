import { resolve } from 'node:path'

/** Server configuration, all overridable by environment variables. */

export const PORT = Number(process.env.PORT ?? 4000)
export const NODE_ENV = process.env.NODE_ENV ?? 'development'

/**
 * Development mode changes two things: the verification code is printed to the
 * server console (there is no mail provider configured) and the seeded staff
 * accounts may be created. A verification code is never returned in an API
 * response, in any mode — it would defeat the point of verifying the address.
 */
export const IS_DEV = NODE_ENV !== 'production'
export const IS_TEST = NODE_ENV === 'test'

/**
 * Email delivery is intentionally deferred while the product is being built.
 * Development skips the gate by default; production keeps it enabled unless
 * explicitly configured otherwise.
 */
export const REQUIRE_EMAIL_VERIFICATION =
  process.env.REQUIRE_EMAIL_VERIFICATION === undefined
    ? !IS_DEV
    : process.env.REQUIRE_EMAIL_VERIFICATION === 'true'

/**
 * The session-signing secret.
 *
 * In production there is no acceptable default: a guessable secret lets anyone
 * forge a token for any account, so the server refuses to start rather than
 * run insecurely. Development keeps a fixed, clearly-labelled fallback so a
 * fresh clone works without setup.
 */
function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim()
  if (configured) {
    if (!IS_DEV && configured.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.')
    }
    return configured
  }
  if (!IS_DEV) {
    throw new Error(
      'JWT_SECRET is not set. Set a long random value before running outside development.',
    )
  }
  return 'businesslife-dev-secret-change-me'
}

export const JWT_SECRET = resolveJwtSecret()
export const JWT_TTL_SECONDS = 60 * 60 * 24 * 7

/** Where the SQLite file lives. */
export const DATABASE_FILE = resolve(
  process.cwd(),
  process.env.DB_PATH ?? 'server/data/businesslife.db',
)

/** How long an emailed verification or password-reset code stays valid. */
export const CODE_TTL_MINUTES = 15

/**
 * Where the browser application is served from.
 *
 * Only these origins may call the API from a browser. Unset means "any
 * origin", which is what a local development server needs; production must set
 * it explicitly. Native and server-to-server callers send no Origin header and
 * are unaffected.
 */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/** Abuse limits. Counts are per window, per client address. */
export const RATE_LIMITS = {
  /** Sign-in, registration and code requests. */
  auth: { windowMs: 15 * 60_000, max: 20 },
  /** Code verification, which is also a guessing surface. */
  verify: { windowMs: 15 * 60_000, max: 30 },
  /** Anything that writes to a company's books. */
  write: { windowMs: 60_000, max: 120 },
} as const
