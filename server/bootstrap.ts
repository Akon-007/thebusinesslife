import { IS_DEV } from './config'
import { one, run, transaction } from './db'
import { hashPassword, newId } from './security'
import { audit, type Role } from './users'

/** Explicitly opt in to known demo accounts. Never reset an existing password or elevate a user. */
export function seedAccounts(): void {
  if (!IS_DEV && process.env.SEED_DEMO_ACCOUNTS !== 'true') {
    throw new Error('Set SEED_DEMO_ACCOUNTS=true to explicitly allow demo accounts in production.')
  }
  const accounts: { email: string; fullName: string; role: Role; password: string | undefined }[] = [
    { email: 'demo@businesslife.test', fullName: 'Demo Business', role: 'PLAYER', password: process.env.DEMO_PASSWORD ?? (IS_DEV ? 'DemoBusiness!2026' : undefined) },
    { email: 'admin@businesslife.test', fullName: 'System Administrator', role: 'ADMIN', password: process.env.ADMIN_PASSWORD ?? (IS_DEV ? 'AdminPass123' : undefined) },
    { email: 'lecturer@businesslife.test', fullName: 'Dr. Amaka Okoye', role: 'LECTURER', password: process.env.LECTURER_PASSWORD ?? (IS_DEV ? 'LecturerPass123' : undefined) },
  ]
  transaction(() => {
    for (const account of accounts) {
      const existing = one<{ id: string; role: string; email_verified: number }>(
        'SELECT id, role, email_verified FROM users WHERE email = ?', account.email,
      )
      if (existing) {
        if (existing.role !== account.role || existing.email_verified !== 1) {
          throw new Error(`Existing account ${account.email} has a different role or is unverified; resolve it manually before seeding.`)
        }
        console.log(`[seed] Already present: ${account.email}`)
        continue
      }
      if (!account.password || account.password.length < 8) {
        throw new Error(`A password of at least 8 characters is required for ${account.role}.`)
      }
      const now = new Date().toISOString()
      const id = newId()
      run(
        `INSERT INTO users (id, email, password_hash, full_name, role, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        id, account.email, hashPassword(account.password), account.fullName, account.role, now, now,
      )
      audit(id, 'seed.create', `Seeded ${account.role} account ${account.email}`)
      console.log(`[seed] Created verified ${account.role}: ${account.email}`)
    }
  })
}
