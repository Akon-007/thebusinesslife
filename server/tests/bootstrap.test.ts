import { test } from 'node:test'
import assert from 'node:assert/strict'
import { many, one } from './harness'
import { seedAccounts } from '../bootstrap'
import { startServer } from '../app'

test('seed creates three verified accounts, preserves hashes on rerun, and all can log in', async () => {
  seedAccounts()
  const before = many<{ email: string; password_hash: string }>('SELECT email, password_hash FROM users ORDER BY email')
  seedAccounts()
  assert.deepEqual(many('SELECT email, password_hash FROM users ORDER BY email'), before)
  assert.equal(before.length, 3)
  const server = await startServer()
  try {
    for (const [email, password, role] of [
      ['demo@businesslife.test', 'DemoBusiness!2026', 'PLAYER'],
      ['admin@businesslife.test', 'AdminPass123', 'ADMIN'],
      ['lecturer@businesslife.test', 'LecturerPass123', 'LECTURER'],
    ]) {
      assert.equal(one<{ email_verified: number }>('SELECT email_verified FROM users WHERE email = ?', email)?.email_verified, 1)
      const response = await fetch(`${server.url}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      assert.equal(response.status, 200)
      const result = await response.json() as { user: { role: string }; token: string }
      assert.equal(result.user.role, role)
      assert.ok(result.token)
    }
  } finally {
    await server.close()
  }
})
