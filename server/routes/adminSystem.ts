import { Router } from 'express'
import { z } from 'zod'
import { many, one, run } from '../db'
import { requirePermission, wrap } from '../middleware'
import { audit, isRole, parsePermissions, permissionVocabulary, type Role, type UserRow } from '../users'

/**
 * Administrator insights and system control.
 *
 * Two audiences: the Insights group reads the platform's history, and the
 * System group changes who can do what and how the platform behaves. Each is
 * gated separately, so an administrator limited to insights cannot change
 * settings. Every figure in the analytics payload is aggregated from stored
 * rows — there is no decorative number anywhere in this file.
 */

const router = Router()

const allowInsights = requirePermission('insights')
const allowSystem = requirePermission('system')

/* --------------------------------------------------------------- analytics -- */

const ONLINE_WINDOW_MS = 5 * 60 * 1000
const ACTIVE_WINDOW_DAYS = 7

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function countOf(sql: string, ...params: (string | number)[]): number {
  const row = one<{ n: number }>(sql, ...params)
  return row ? Number(row.n) : 0
}

function parseCompleted(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

function levelNumber(id: string): number {
  const match = /^L(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

router.get(
  '/insights/analytics',
  allowInsights,
  wrap(async (_req, res) => {
    const now = Date.now()

    // --- engagement ----------------------------------------------------
    const engagement = {
      totalPlayers: countOf("SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER'"),
      online: countOf(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND last_seen_at >= ?",
        new Date(now - ONLINE_WINDOW_MS).toISOString(),
      ),
      activeThisWeek: countOf(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND last_seen_at >= ?",
        daysAgoIso(ACTIVE_WINDOW_DAYS),
      ),
      inTheCity: countOf('SELECT COUNT(*) AS n FROM player_progress'),
      signInsFailed: countOf(
        "SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auth.login_failed' AND at >= ?",
        daysAgoIso(30),
      ),
    }

    // --- sign-in volume, last 14 days ----------------------------------
    const signInByDay = many<{ day: string; n: number }>(
      `SELECT substr(at, 1, 10) AS day, COUNT(*) AS n
       FROM audit_logs WHERE action = 'auth.login' AND at >= ?
       GROUP BY day ORDER BY day ASC`,
      daysAgoIso(14),
    ).map((r) => ({ day: r.day, count: Number(r.n) }))

    // --- sector performance --------------------------------------------
    const sectorRows = many<{ sector: string; n: number }>(
      'SELECT sector, COUNT(*) AS n FROM business_profiles GROUP BY sector ORDER BY n DESC, sector ASC',
    )

    const sectorLevels = many<{ sector: string; level_index: number; xp: number }>(
      `SELECT b.sector AS sector, p.level_index AS level_index, p.xp AS xp
       FROM business_profiles b JOIN player_progress p ON p.user_id = b.user_id`,
    )
    const sectorTotals = new Map<string, { sum: number; n: number; xp: number }>()
    for (const row of sectorLevels) {
      const entry = sectorTotals.get(row.sector) ?? { sum: 0, n: 0, xp: 0 }
      entry.sum += row.level_index
      entry.n += 1
      entry.xp += row.xp
      sectorTotals.set(row.sector, entry)
    }
    const sectors = sectorRows.map((row) => {
      const totals = sectorTotals.get(row.sector)
      return {
        sector: row.sector,
        companies: Number(row.n),
        activePlayers: totals?.n ?? 0,
        averageLevel: totals && totals.n > 0 ? totals.sum / totals.n : 0,
        totalXp: totals?.xp ?? 0,
      }
    })

    // --- progression funnel --------------------------------------------
    const progressRows = many<{ level_index: number; completed_levels: string; xp: number }>(
      'SELECT level_index, completed_levels, xp FROM player_progress',
    )
    const reachedByLevel = new Map<number, number>()
    const completedByLevel = new Map<number, number>()
    for (const row of progressRows) {
      const done = parseCompleted(row.completed_levels)
      const highest = Math.max(row.level_index, ...done.map(levelNumber), 0)
      for (let n = 1; n <= highest; n++) {
        reachedByLevel.set(n, (reachedByLevel.get(n) ?? 0) + 1)
      }
      for (const id of done) {
        const n = levelNumber(id)
        if (n > 0) completedByLevel.set(n, (completedByLevel.get(n) ?? 0) + 1)
      }
    }
    const funnel = Array.from({ length: 15 }, (_unused, i) => {
      const level = i + 1
      const reached = reachedByLevel.get(level) ?? 0
      const completed = completedByLevel.get(level) ?? 0
      return {
        levelId: `L${level}`,
        level,
        reached,
        completed,
        completionRate: reached === 0 ? 0 : completed / reached,
      }
    })

    // --- leaderboard ----------------------------------------------------
    const topPlayers = many<{ id: string; full_name: string; xp: number; level_index: number; business_name: string | null }>(
      `SELECT u.id, u.full_name, p.xp, p.level_index, b.business_name
       FROM player_progress p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN business_profiles b ON b.user_id = u.id
       ORDER BY p.xp DESC LIMIT 10`,
    ).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      xp: Number(row.xp),
      levelIndex: Number(row.level_index),
      businessName: row.business_name,
    }))

    // --- classroom and simulation usage --------------------------------
    const classroom = {
      classes: countOf('SELECT COUNT(*) AS n FROM classes'),
      activeClasses: countOf("SELECT COUNT(*) AS n FROM classes WHERE status = 'ACTIVE'"),
      students: countOf("SELECT COUNT(*) AS n FROM class_members WHERE status = 'ACTIVE'"),
      pendingRequests: countOf("SELECT COUNT(*) AS n FROM class_members WHERE status = 'PENDING'"),
      assignments: countOf('SELECT COUNT(*) AS n FROM assignments'),
      scenarios: countOf('SELECT COUNT(*) AS n FROM scenarios'),
      assessments: countOf('SELECT COUNT(*) AS n FROM assessments'),
    }

    const events = {
      total: countOf('SELECT COUNT(*) AS n FROM simulation_events'),
      active: countOf("SELECT COUNT(*) AS n FROM simulation_events WHERE status = 'ACTIVE'"),
      scheduled: countOf("SELECT COUNT(*) AS n FROM simulation_events WHERE status = 'SCHEDULED'"),
      ended: countOf("SELECT COUNT(*) AS n FROM simulation_events WHERE status = 'ENDED'"),
    }

    res.json({
      engagement,
      signInByDay,
      sectors,
      funnel,
      topPlayers,
      classroom,
      events,
    })
  }),
)

/* ------------------------------------------------------------ activity logs -- */

router.get(
  '/insights/logs',
  allowInsights,
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const category = typeof req.query.category === 'string' ? req.query.category : 'ALL'
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30))

    const where: string[] = []
    const params: (string | number)[] = []

    if (q) {
      where.push('(a.action LIKE ? OR a.detail LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like, like)
    }
    if (category !== 'ALL' && /^[a-z]+$/.test(category)) {
      where.push('a.action LIKE ?')
      params.push(`${category}.%`)
    }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const totalRow = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${clause}`,
      ...params,
    )
    const total = totalRow ? Number(totalRow.n) : 0

    const rows = many<{
      id: string
      action: string
      detail: string
      at: string
      full_name: string | null
      email: string | null
      role: string | null
    }>(
      `SELECT a.id, a.action, a.detail, a.at, u.full_name, u.email, u.role
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${clause} ORDER BY a.at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    )

    const categories = many<{ prefix: string }>(
      "SELECT DISTINCT substr(action, 1, instr(action, '.') - 1) AS prefix FROM audit_logs WHERE instr(action, '.') > 0 ORDER BY prefix ASC",
    )
      .map((row) => row.prefix)
      .filter((prefix) => prefix.length > 0)

    res.json({
      logs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        detail: row.detail,
        at: row.at,
        actor: row.full_name,
        actorEmail: row.email,
        actorRole: row.role,
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      categories,
    })
  }),
)

/* ------------------------------------------------------ users & permissions -- */

interface StaffRow extends UserRow {
  class_count: number
}

function toStaff(row: StaffRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: isRole(row.role) ? row.role : 'PLAYER',
    status: row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    emailVerified: row.email_verified === 1,
    permissions: parsePermissions(row.permissions),
    classes: Number(row.class_count ?? 0),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }
}

router.get(
  '/system/meta',
  allowSystem,
  wrap(async (_req, res) => {
    res.json(permissionVocabulary())
  }),
)

/** Staff accounts: the administrators and lecturers who run the platform. */
router.get(
  '/system/users',
  allowSystem,
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const role = typeof req.query.role === 'string' ? req.query.role : 'ALL'

    const where: string[] = ["u.role IN ('ADMIN','LECTURER')"]
    const params: (string | number)[] = []
    if (q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    if (role === 'ADMIN' || role === 'LECTURER') {
      where.push('u.role = ?')
      params.push(role)
    }

    const rows = many<StaffRow>(
      `SELECT u.*, (SELECT COUNT(*) FROM classes c WHERE c.lecturer_id = u.id) AS class_count
       FROM users u WHERE ${where.join(' AND ')} ORDER BY u.role ASC, u.full_name ASC`,
      ...params,
    )

    res.json({
      users: rows.map(toStaff),
      total: rows.length,
      admins: rows.filter((row) => row.role === 'ADMIN').length,
      lecturers: rows.filter((row) => row.role === 'LECTURER').length,
      meta: permissionVocabulary(),
    })
  }),
)

router.put(
  '/system/users/:id/permissions',
  allowSystem,
  wrap(async (req, res) => {
    const parsed = z
      .object({ permissions: z.array(z.enum(['content', 'world', 'players', 'simulation', 'insights', 'system'])).max(6) })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the permissions you selected.' })
      return
    }

    const id = String(req.params.id)
    const target = one<UserRow>('SELECT * FROM users WHERE id = ?', id)
    if (!target) {
      res.status(404).json({ error: 'That account does not exist.' })
      return
    }
    if (target.role !== 'ADMIN') {
      res.status(400).json({ error: 'Only administrator accounts carry administrative permissions.' })
      return
    }
    if (target.id === req.user!.id && parsed.data.permissions.length > 0) {
      const own = req.user!.permissions
      if (own.length > 0 && !parsed.data.permissions.includes('system')) {
        res.status(400).json({ error: 'You cannot remove your own access to this screen.' })
        return
      }
    }

    run(
      'UPDATE users SET permissions = ?, updated_at = ? WHERE id = ?',
      JSON.stringify(parsed.data.permissions),
      new Date().toISOString(),
      id,
    )
    audit(
      req.user!.id,
      'admin.system.permissions',
      `Set permissions for ${target.full_name}: ${parsed.data.permissions.join(', ') || 'full access'}`,
    )

    const row = one<StaffRow>(
      `SELECT u.*, (SELECT COUNT(*) FROM classes c WHERE c.lecturer_id = u.id) AS class_count
       FROM users u WHERE u.id = ?`,
      id,
    )
    res.json({ user: row ? toStaff(row) : null })
  }),
)

router.put(
  '/system/users/:id/role',
  allowSystem,
  wrap(async (req, res) => {
    const parsed = z.object({ role: z.enum(['ADMIN', 'LECTURER']) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a valid staff role.' })
      return
    }

    const id = String(req.params.id)
    const target = one<UserRow>('SELECT * FROM users WHERE id = ?', id)
    if (!target || !['ADMIN', 'LECTURER'].includes(target.role)) {
      res.status(404).json({ error: 'That staff account does not exist.' })
      return
    }
    if (target.id === req.user!.id) {
      res.status(400).json({ error: 'You cannot change your own role.' })
      return
    }

    const next: Role = parsed.data.role
    run(
      'UPDATE users SET role = ?, permissions = ?, updated_at = ? WHERE id = ?',
      next,
      next === 'ADMIN' ? target.permissions ?? '[]' : '[]',
      new Date().toISOString(),
      id,
    )
    audit(req.user!.id, 'admin.system.role', `Changed ${target.full_name} to ${next}`)

    const row = one<StaffRow>(
      `SELECT u.*, (SELECT COUNT(*) FROM classes c WHERE c.lecturer_id = u.id) AS class_count
       FROM users u WHERE u.id = ?`,
      id,
    )
    res.json({ user: row ? toStaff(row) : null })
  }),
)

function setStaffStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actorId: string) {
  const target = one<UserRow>('SELECT * FROM users WHERE id = ?', id)
  if (!target || !['ADMIN', 'LECTURER'].includes(target.role)) {
    return { ok: false as const, reason: 'not_found' as const }
  }
  if (target.id === actorId) return { ok: false as const, reason: 'self' as const }
  if (target.status === status) return { ok: false as const, reason: 'unchanged' as const }

  run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', status, new Date().toISOString(), id)
  audit(
    actorId,
    status === 'SUSPENDED' ? 'admin.system.suspend' : 'admin.system.restore',
    `${status === 'SUSPENDED' ? 'Suspended' : 'Restored'} ${target.full_name}`,
  )
  return { ok: true as const }
}

router.post(
  '/system/users/:id/suspend',
  allowSystem,
  wrap(async (req, res) => {
    const result = setStaffStatus(String(req.params.id), 'SUSPENDED', req.user!.id)
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 400
      res.status(status).json({
        error:
          result.reason === 'not_found'
            ? 'That staff account does not exist.'
            : result.reason === 'self'
              ? 'You cannot suspend your own account.'
              : 'That account is already suspended.',
      })
      return
    }
    res.json({ ok: true, status: 'SUSPENDED' })
  }),
)

router.post(
  '/system/users/:id/restore',
  allowSystem,
  wrap(async (req, res) => {
    const result = setStaffStatus(String(req.params.id), 'ACTIVE', req.user!.id)
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 400
      res.status(status).json({
        error:
          result.reason === 'not_found'
            ? 'That staff account does not exist.'
            : result.reason === 'self'
              ? 'Your own account is already active.'
              : 'That account is already active.',
      })
      return
    }
    res.json({ ok: true, status: 'ACTIVE' })
  }),
)

/* ---------------------------------------------------------------- settings -- */

interface SettingDef {
  key: string
  label: string
  type: 'text' | 'boolean' | 'number'
  defaultValue: string
  description: string
  group: string
}

/**
 * The platform settings the System group can change. The list is the contract:
 * an unknown key cannot be written, and a value is validated against its type.
 */
const SETTING_DEFS: SettingDef[] = [
  { key: 'platform_name', label: 'Platform name', type: 'text', defaultValue: 'BUSINESSLIFE', description: 'Shown in the portals and on the landing page.', group: 'Branding' },
  { key: 'support_email', label: 'Support email', type: 'text', defaultValue: 'support@businesslife.test', description: 'Where players are told to write for help.', group: 'Branding' },
  { key: 'timezone', label: 'Reporting timezone', type: 'text', defaultValue: 'Africa/Lagos', description: 'Used when the platform reports dates and deadlines.', group: 'Branding' },
  { key: 'registration_open', label: 'Player registration open', type: 'boolean', defaultValue: 'true', description: 'When off, new player accounts cannot be created.', group: 'Access' },
  { key: 'lecturer_registration_open', label: 'Lecturer self-registration open', type: 'boolean', defaultValue: 'false', description: 'When on, teaching staff may request an account.', group: 'Access' },
  { key: 'maintenance_mode', label: 'Maintenance mode', type: 'boolean', defaultValue: 'false', description: 'Player sign-in is refused while maintenance is in progress.', group: 'Access' },
  { key: 'session_days', label: 'Session length (days)', type: 'number', defaultValue: '7', description: 'How long a signed-in session remains valid.', group: 'Access' },
  { key: 'default_class_size', label: 'Default class size alert', type: 'number', defaultValue: '40', description: 'Classes above this size are flagged to administrators.', group: 'Classroom' },
  { key: 'class_join_mode', label: 'Class joining', type: 'text', defaultValue: 'approval', description: 'Whether joining a class is "open" or needs lecturer "approval".', group: 'Classroom' },
]

function readSettings() {
  const rows = many<{ key: string; value: string; updated_at: string }>('SELECT key, value, updated_at FROM app_settings')
  const stored = new Map(rows.map((row) => [row.key, row]))
  return SETTING_DEFS.map((def) => {
    const row = stored.get(def.key)
    return {
      key: def.key,
      label: def.label,
      type: def.type,
      group: def.group,
      description: def.description,
      value: row?.value ?? def.defaultValue,
      updatedAt: row?.updated_at ?? null,
    }
  })
}

router.get(
  '/system/settings',
  allowSystem,
  wrap(async (_req, res) => {
    const settings = readSettings()
    const groups = Array.from(new Set(settings.map((s) => s.group)))
    res.json({ settings, groups })
  }),
)

router.put(
  '/system/settings',
  allowSystem,
  wrap(async (req, res) => {
    const parsed = z
      .object({ values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the settings you submitted.' })
      return
    }

    const now = new Date().toISOString()
    const changed: string[] = []

    for (const [key, raw] of Object.entries(parsed.data.values)) {
      const def = SETTING_DEFS.find((entry) => entry.key === key)
      if (!def) {
        res.status(400).json({ error: `"${key}" is not a setting this platform recognises.` })
        return
      }

      let value: string
      if (def.type === 'boolean') {
        if (typeof raw !== 'boolean') {
          res.status(400).json({ error: `${def.label} must be on or off.` })
          return
        }
        value = raw ? 'true' : 'false'
      } else if (def.type === 'number') {
        const num = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(num) || num < 0 || num > 100_000) {
          res.status(400).json({ error: `${def.label} must be a positive number.` })
          return
        }
        value = String(Math.round(num))
      } else {
        const text = String(raw).trim()
        if (text.length === 0 || text.length > 120) {
          res.status(400).json({ error: `${def.label} must be between 1 and 120 characters.` })
          return
        }
        value = text
      }

      run(
        `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        key,
        value,
        now,
        req.user!.id,
      )
      changed.push(def.label)
    }

    if (changed.length === 0) {
      res.status(400).json({ error: 'No settings were changed.' })
      return
    }

    audit(req.user!.id, 'admin.system.settings', `Updated settings: ${changed.join(', ')}`)
    res.json({ settings: readSettings() })
  }),
)

export default router
