import { Router } from 'express'
import { z } from 'zod'
import { IS_DEV, REQUIRE_EMAIL_VERIFICATION } from '../config'
import { one, run } from '../db'
import { requireAuth, wrap } from '../middleware'
import {
  codeExpiry,
  generateVerificationCode,
  hashPassword,
  newId,
  signToken,
  verifyPassword,
} from '../security'
import { type UserRow, audit, toPublicUser } from '../users'

/**
 * Sign-up, email verification and sign-in, plus password recovery.
 *
 * A verification or reset code is delivered out of band (the console in
 * development, a mail provider in production) and is never included in an API
 * response — returning it would let anyone who can call the endpoint take over
 * the address it is meant to prove.
 */

const router = Router()

/** Deliberately permissive but strict about the essentials. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailField = z.string().trim().max(255).regex(EMAIL_PATTERN, 'Enter a valid email address.')

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
  email: emailField,
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
})

const verifySchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
})

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.').max(200),
})

const forgotSchema = z.object({ email: emailField })

const resetSchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
})

/** The two reasons a code is ever issued. Kept apart so one can never stand in for the other. */
type CodePurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET'

function issueCode(userId: string, purpose: CodePurpose): string {
  // Any earlier code of the same kind stops working the moment a new one is issued.
  run(
    'UPDATE email_codes SET consumed = 1 WHERE user_id = ? AND purpose = ? AND consumed = 0',
    userId,
    purpose,
  )
  const code = generateVerificationCode()
  run(
    'INSERT INTO email_codes (id, user_id, code, purpose, expires_at, consumed, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    newId(),
    userId,
    code,
    purpose,
    codeExpiry(),
    new Date().toISOString(),
  )
  return code
}

/** Delivers the code. Without a mail provider configured this is the console. */
function deliverCode(email: string, code: string, purpose: CodePurpose): void {
  const what = purpose === 'PASSWORD_RESET' ? 'password reset code' : 'verification code'
  if (IS_DEV) {
    console.log(`[auth] ${what} for ${email}: ${code}`)
  } else {
    console.log(`[auth] a ${what} was issued for ${email}`)
  }
}

router.post(
  '/register',
  wrap(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const fullName = parsed.data.fullName

    if (one<{ id: string }>('SELECT id FROM users WHERE email = ?', email)) {
      res.status(409).json({ error: 'An account with this email already exists.' })
      return
    }

    const now = new Date().toISOString()
    const id = newId()
    run(
      `INSERT INTO users (id, email, password_hash, full_name, role, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PLAYER', 0, ?, ?)`,
      id,
      email,
      hashPassword(parsed.data.password),
      fullName,
      now,
      now,
    )

    if (REQUIRE_EMAIL_VERIFICATION) {
      const code = issueCode(id, 'EMAIL_VERIFY')
      deliverCode(email, code, 'EMAIL_VERIFY')
    } else {
      run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', now, id)
    }
    audit(id, 'auth.register', `Account created for ${email}`)

    const row = one<UserRow>('SELECT * FROM users WHERE id = ?', id)
    const user = row ? toPublicUser(row) : null
    res.status(201).json({
      user,
      ...(user && !REQUIRE_EMAIL_VERIFICATION ? { token: signToken(user.id, user.role) } : {}),
    })
  }),
)

router.post(
  '/verify-email',
  wrap(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the code.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email)
    if (!row) {
      res.status(400).json({ error: 'That code is not correct.' })
      return
    }

    const code = one<{ id: string; code: string; expires_at: string }>(
      "SELECT id, code, expires_at FROM email_codes WHERE user_id = ? AND purpose = 'EMAIL_VERIFY' AND consumed = 0 ORDER BY created_at DESC LIMIT 1",
      row.id,
    )

    if (!code) {
      res.status(400).json({ error: 'That code has expired. Request a new one.' })
      return
    }
    if (code.code !== parsed.data.code) {
      res.status(400).json({ error: 'That code is not correct.' })
      return
    }
    if (new Date(code.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'That code has expired. Request a new one.' })
      return
    }

    const now = new Date().toISOString()
    run('UPDATE email_codes SET consumed = 1 WHERE id = ?', code.id)
    run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', now, row.id)

    audit(row.id, 'auth.verify_email', `Email verified for ${email}`)

    const updated = one<UserRow>('SELECT * FROM users WHERE id = ?', row.id)
    const user = toPublicUser(updated ?? row)
    res.json({ token: signToken(user.id, user.role), user })
  }),
)

router.post(
  '/resend-code',
  wrap(async (req, res) => {
    const parsed = z.object({ email: emailField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email address.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email)

    // Never reveal whether an address is registered.
    if (!row || row.email_verified === 1) {
      res.json({ ok: true })
      return
    }

    const code = issueCode(row.id, 'EMAIL_VERIFY')
    deliverCode(email, code, 'EMAIL_VERIFY')
    res.json({ ok: true })
  }),
)

router.post(
  '/login',
  wrap(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter your email and password.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email)

    // One message for both branches, so the endpoint cannot enumerate accounts.
    if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
      audit(row?.id ?? null, 'auth.login_failed', `Failed sign-in for ${email}`)
      res.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }

    const user = toPublicUser(row)
    if (user.status === 'SUSPENDED') {
      audit(row.id, 'auth.login_blocked', `Suspended account attempted sign-in: ${email}`)
      res.status(403).json({
        error: 'This account has been suspended. Contact an administrator.',
        code: 'ACCOUNT_SUSPENDED',
      })
      return
    }
    if (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      const code = issueCode(row.id, 'EMAIL_VERIFY')
      deliverCode(email, code, 'EMAIL_VERIFY')
      res.status(403).json({
        error: 'Verify your email to continue.',
        code: 'EMAIL_NOT_VERIFIED',
      })
      return
    }

    audit(row.id, 'auth.login', `Signed in as ${email}`)
    res.json({ token: signToken(user.id, user.role), user })
  }),
)

/**
 * Step one of password recovery: ask for a reset code.
 *
 * The response is identical whether or not the address is registered, so the
 * endpoint cannot be used to find out who has an account. The code itself goes
 * out of band and is never returned.
 */
router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const parsed = forgotSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email address.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email)
    if (row) {
      const code = issueCode(row.id, 'PASSWORD_RESET')
      deliverCode(email, code, 'PASSWORD_RESET')
      audit(row.id, 'auth.password_reset_requested', `Password reset requested for ${email}`)
    }
    res.json({ ok: true })
  }),
)

/**
 * Step two: exchange the reset code for a new password.
 *
 * Only a live `PASSWORD_RESET` code for this account will do — a verification
 * code cannot be replayed here. On success every earlier reset code is spent.
 */
router.post(
  '/reset-password',
  wrap(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details.' })
      return
    }

    const email = parsed.data.email.toLowerCase()
    const row = one<UserRow>('SELECT * FROM users WHERE email = ?', email)
    if (!row) {
      res.status(400).json({ error: 'That reset code is not correct.' })
      return
    }

    const code = one<{ id: string; code: string; expires_at: string }>(
      "SELECT id, code, expires_at FROM email_codes WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND consumed = 0 ORDER BY created_at DESC LIMIT 1",
      row.id,
    )
    if (!code || code.code !== parsed.data.code) {
      res.status(400).json({ error: 'That reset code is not correct.' })
      return
    }
    if (new Date(code.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'That code has expired. Request a new one.' })
      return
    }

    const now = new Date().toISOString()
    run('UPDATE email_codes SET consumed = 1 WHERE id = ?', code.id)
    run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      hashPassword(parsed.data.password),
      now,
      row.id,
    )
    audit(row.id, 'auth.password_reset', `Password reset for ${email}`)
    res.json({ ok: true })
  }),
)

/**
 * The signed-in identity, re-read from the database.
 *
 * The client calls this on boot to turn a stored token back into a session.
 */
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    res.json({ user: req.user })
  }),
)

export default router
