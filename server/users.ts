import { newId } from './security'
import { run } from './db'

/** User roles. Stored as text because SQLite has no enum type. */
export const ROLES = ['PLAYER', 'ADMIN', 'LECTURER'] as const

export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** Account states. A suspended account can sign in but is refused everywhere else. */
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const

export type UserStatus = (typeof USER_STATUSES)[number]

/**
 * The administrative areas an ADMIN account can be granted.
 *
 * An account with no explicit grant holds every area, so the seeded
 * administrator and any account created before this list existed keep full
 * access. Areas map one-to-one onto the administrator portal's navigation
 * groups, and are enforced when the API routes are mounted.
 */
export const ADMIN_PERMISSIONS = [
  'content',
  'world',
  'players',
  'simulation',
  'insights',
  'system',
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  content: 'Stages, levels & missions',
  world: 'NPCs, investors, sectors & city',
  players: 'Player accounts',
  simulation: 'Economy, rules, compliance & events',
  insights: 'Analytics & activity logs',
  system: 'Users, permissions & settings',
}

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && (ADMIN_PERMISSIONS as readonly string[]).includes(value)
}

/** Raw `users` row as SQLite returns it. */
export interface UserRow {
  id: string
  email: string
  password_hash: string
  full_name: string
  role: string
  email_verified: number
  status: string
  last_seen_at: string | null
  permissions: string | null
  created_at: string
  updated_at: string
}

/** The shape of a user that is safe to send to the client. */
export interface PublicUser {
  id: string
  email: string
  fullName: string
  role: Role
  emailVerified: boolean
  status: UserStatus
  permissions: AdminPermission[]
  createdAt: string
}

/** A JSON list column, read defensively. Anything unusable degrades to []. */
export function parsePermissions(raw: string | null): AdminPermission[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(isAdminPermission)
  } catch {
    /* fall through */
  }
  return []
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: isRole(row.role) ? row.role : 'PLAYER',
    emailVerified: row.email_verified === 1,
    status: row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    permissions: parsePermissions(row.permissions),
    createdAt: row.created_at,
  }
}

/** The vocabulary the Users & Permissions screen renders. */
export function permissionVocabulary() {
  return {
    permissions: ADMIN_PERMISSIONS.map((value) => ({
      value,
      label: ADMIN_PERMISSION_LABELS[value],
    })),
    roles: [...ROLES],
    statuses: [...USER_STATUSES],
  }
}

/**
 * Append an entry to the audit trail.
 *
 * This throws if the entry cannot be written. An audit trail that silently
 * drops the entry it was asked to record is worse than none at all: it turns a
 * missing record into an invisible failure. Callers that make a consequential
 * change inside a transaction therefore roll that change back if the audit
 * cannot be written, so nothing happens without being recorded.
 *
 * The table itself refuses updates and deletes (see `db.ts`), so a row can only
 * ever be added.
 */
export function audit(userId: string | null, action: string, detail: string): void {
  run(
    'INSERT INTO audit_logs (id, user_id, action, detail, at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    userId,
    action,
    detail,
    new Date().toISOString(),
  )
}
