import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Test harness.
 *
 * Every test file runs in its own process, so the first thing this module does
 * is delete the test database to give the file a clean slate. That has to
 * happen *before* `../db` is imported — the driver opens the file on import —
 * so the database is pulled in with a dynamic import after the wipe.
 *
 * Tests therefore never share state with each other or with the development
 * database. Run the suite with `--test-concurrency=1` so two files cannot hold
 * the same file at once.
 */

const DB_FILE = resolve(process.cwd(), process.env.DB_PATH ?? 'server/data/test-businesslife.db')
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true })
}

const database = await import('../db')

export const { one, many, run, transaction } = database

/** Inserts a signed-in user and returns its id. */
export function createTestUser(overrides: { id?: string; email?: string; role?: string } = {}): string {
  const id = overrides.id ?? `u_${Math.random().toString(36).slice(2, 10)}`
  const now = new Date().toISOString()
  run(
    `INSERT INTO users (id, email, password_hash, full_name, role, email_verified, created_at, updated_at)
     VALUES (?, ?, 'scrypt:test:test', 'Test User', ?, 1, ?, ?)`,
    id,
    overrides.email ?? `${id}@example.test`,
    overrides.role ?? 'PLAYER',
    now,
    now,
  )
  return id
}

/**
 * Gives a player the onboarding profile their company is provisioned from.
 *
 * A company cannot be opened without the business concept the player typed in
 * during onboarding, so tests that exercise the company surface have to seed
 * one first.
 */
export function createBusinessProfile(
  userId: string,
  overrides: { businessName?: string; sector?: string } = {},
): void {
  const now = new Date().toISOString()
  run(
    `INSERT INTO business_profiles
       (id, user_id, business_name, sector, idea, description, problem, product, ambition, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `bp_${userId}`,
    userId,
    overrides.businessName ?? 'Test Ventures',
    overrides.sector ?? 'Retail',
    'A test idea',
    'A test description',
    'A test problem',
    'A test product',
    'grow steadily',
    now,
    now,
  )
}
