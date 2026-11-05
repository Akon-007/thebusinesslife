import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { IS_TEST, RATE_LIMITS } from './config'

/**
 * A small fixed-window rate limiter.
 *
 * It exists to blunt the two cheapest attacks on the API: guessing passwords
 * or verification codes, and hammering write endpoints. Counts are held in
 * memory, keyed by client address, which is enough for a single-process
 * deployment; a multi-process deployment would move this to a shared store.
 *
 * Disabled under test so a suite can exercise a route as often as it likes.
 */
interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitOptions {
  /** Namespace so distinct endpoints never share a counter. */
  name: string
  windowMs: number
  max: number
  /** What the caller was doing, used in the refusal message. */
  label: string
}

function clientAddress(req: Request): string {
  // `trust proxy` is off by default, so `req.ip` is the socket address and
  // cannot be spoofed with a header. Fine for the single-process deployment.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (IS_TEST) {
      next()
      return
    }

    const now = Date.now()
    const bucketKey = `${options.name}:${clientAddress(req)}`
    const current = buckets.get(bucketKey)

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs })
      next()
      return
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSeconds))
      res.status(429).json({
        error: `Too many ${options.label} attempts. Please wait ${retryAfterSeconds}s and try again.`,
        code: 'RATE_LIMITED',
      })
      return
    }

    current.count += 1
    next()
  }
}

export const authRateLimit = rateLimit({
  name: 'auth',
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  label: 'sign-in',
})

export const verifyRateLimit = rateLimit({
  name: 'verify',
  windowMs: RATE_LIMITS.verify.windowMs,
  max: RATE_LIMITS.verify.max,
  label: 'verification',
})

export const writeRateLimit = rateLimit({
  name: 'write',
  windowMs: RATE_LIMITS.write.windowMs,
  max: RATE_LIMITS.write.max,
  label: 'request',
})

/** Test helper: clear all counters between cases. */
export function resetRateLimits(): void {
  buckets.clear()
}
