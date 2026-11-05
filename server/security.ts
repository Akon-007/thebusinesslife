import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { CODE_TTL_MINUTES, JWT_SECRET, JWT_TTL_SECONDS } from './config'

/** Identifiers, password hashing, verification codes and session tokens. */

export function newId(): string {
  return randomUUID()
}

const KEY_LENGTH = 64

/** Hash a password with scrypt. Format: `scrypt:<salt>:<derived key>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${derived}`
}

/** Constant-time password check. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const candidate = scryptSync(password, salt, KEY_LENGTH)
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

/** A six-digit code, delivered by email in production. */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** ISO timestamp marking when a code stops being valid. */
export function codeExpiry(): string {
  return new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()
}

export interface TokenPayload {
  sub: string
  role: string
}

export function signToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: JWT_TTL_SECONDS })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (typeof decoded !== 'object' || decoded === null) return null
    const { sub, role } = decoded as Record<string, unknown>
    if (typeof sub !== 'string' || typeof role !== 'string') return null
    return { sub, role }
  } catch {
    return null
  }
}
