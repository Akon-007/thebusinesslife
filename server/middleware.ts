import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { one, run } from './db'
import { REQUIRE_EMAIL_VERIFICATION } from './config'
import { verifyToken } from './security'
import { type AdminPermission, type PublicUser, type Role, type UserRow, toPublicUser } from './users'

/** Authentication and role enforcement. Every permission decision happens here
 *  on the server — the client is never trusted to police its own access. */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser
    }
  }
}

/** Wraps an async handler so a rejected promise becomes a 500 instead of a hang. */
export function wrap(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}

/** Requires a valid, verified session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'Sign in to continue.' })
    return
  }

  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' })
    return
  }

  const row = one<UserRow>('SELECT * FROM users WHERE id = ?', payload.sub)
  if (!row) {
    res.status(401).json({ error: 'That account no longer exists.' })
    return
  }

  const user = toPublicUser(row)
  if (user.status === 'SUSPENDED') {
    res.status(403).json({
      error: 'This account has been suspended. Contact an administrator.',
      code: 'ACCOUNT_SUSPENDED',
    })
    return
  }
  if (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
    res.status(403).json({ error: 'Verify your email to continue.', code: 'EMAIL_NOT_VERIFIED' })
    return
  }

  // Presence, for the administrator's "currently online" figure. Written at
  // most once a minute so a chatty client cannot hammer the database.
  const now = Date.now()
  const lastSeen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0
  if (!Number.isFinite(lastSeen) || now - lastSeen > 60_000) {
    run('UPDATE users SET last_seen_at = ? WHERE id = ?', new Date(now).toISOString(), row.id)
  }

  req.user = user
  next()
}

/** Requires the signed-in user to hold one of the given roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in to continue.' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Your account does not have access to this area.',
        code: 'FORBIDDEN',
      })
      return
    }
    next()
  }
}

/**
 * Requires an administrator to hold at least one of the given areas.
 *
 * This is the second half of the administrator's access control: `requireRole`
 * decides whether an account is an administrator at all, this decides which
 * parts of the platform that administrator may operate. An account with no
 * explicit grants holds every area, so the seeded administrator is unaffected.
 */
export function requirePermission(...areas: AdminPermission[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in to continue.' })
      return
    }
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'That area is for administrators.', code: 'FORBIDDEN' })
      return
    }
    const granted = req.user.permissions
    if (granted.length === 0 || areas.some((area) => granted.includes(area))) {
      next()
      return
    }
    res.status(403).json({
      error: 'Your administrator account does not cover this area.',
      code: 'FORBIDDEN',
    })
  }
}
