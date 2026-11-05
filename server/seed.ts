import { IS_DEV } from './config'
import { one, run } from './db'
import { hashPassword, newId } from './security'
import { audit, type Role } from './users'

/**
 * Creates the staff accounts the portals need. Safe to run repeatedly — an
 * account that already exists is left untouched.
 *
 * These accounts carry known passwords, so the script refuses to run anywhere
 * but development: seeding them into a production database would hand anyone
 * who has read this file an administrator login.
 */

if (!IS_DEV) {
  console.error(
    '[seed] Refusing to seed accounts with known passwords outside development. ' +
      'Create staff accounts through the administrator portal instead.',
  )
  process.exit(1)
}

interface SeedAccount {
  email: string
  fullName: string
  role: Role
  password: string
}

const ACCOUNTS: SeedAccount[] = [
  {
    email: 'admin@businesslife.test',
    fullName: 'System Administrator',
    role: 'ADMIN',
    password: 'AdminPass123',
  },
  {
    email: 'lecturer@businesslife.test',
    fullName: 'Dr. Amaka Okoye',
    role: 'LECTURER',
    password: 'LecturerPass123',
  },
]

let created = 0
let skipped = 0

for (const account of ACCOUNTS) {
  const existing = one<{ id: string }>('SELECT id FROM users WHERE email = ?', account.email)
  if (existing) {
    console.log(`= ${account.role.padEnd(8)} already exists: ${account.email}`)
    skipped += 1
    continue
  }

  const now = new Date().toISOString()
  const id = newId()
  run(
    `INSERT INTO users (id, email, password_hash, full_name, role, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    account.email,
    hashPassword(account.password),
    account.fullName,
    account.role,
    now,
    now,
  )
  audit(id, 'seed.create', `Seeded ${account.role} account ${account.email}`)
  console.log(`+ ${account.role.padEnd(8)} created: ${account.email} / ${account.password}`)
  created += 1
}

console.log(`\nSeed complete: ${created} created, ${skipped} already present.`)
