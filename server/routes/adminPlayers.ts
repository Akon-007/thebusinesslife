import { Router } from 'express'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { audit } from '../users'

/**
 * Administrator player management.
 *
 * Read-heavy, with the two write actions that matter operationally: suspend and
 * restore. Both are recorded in the audit trail with the administrator's id, so
 * account actions are always attributable.
 *
 * Only player accounts are reachable here. An administrator cannot suspend
 * another staff account through this endpoint, which keeps a mistake from
 * locking the team out of the platform.
 */

const router = Router()

interface PlayerRow {
  id: string
  email: string
  full_name: string
  status: string
  email_verified: number
  created_at: string
  last_seen_at: string | null
  business_name: string | null
  sector: string | null
  level_index: number | null
  stage_index: number | null
  xp: number | null
  cash: number | null
  reputation: number | null
  completed_levels: string | null
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

function toPlayerSummary(row: PlayerRow) {
  const completed = parseCompleted(row.completed_levels)
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    status: row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    businessName: row.business_name,
    sector: row.sector,
    levelIndex: row.level_index,
    stageIndex: row.stage_index,
    xp: row.xp,
    cash: row.cash,
    reputation: row.reputation,
    completedLevels: completed.length,
  }
}

const BASE_SELECT = `
  SELECT u.id, u.email, u.full_name, u.status, u.email_verified, u.created_at, u.last_seen_at,
         b.business_name, b.sector,
         p.level_index, p.stage_index, p.xp, p.cash, p.reputation, p.completed_levels
  FROM users u
  LEFT JOIN business_profiles b ON b.user_id = u.id
  LEFT JOIN player_progress  p ON p.user_id = u.id
`

/** Search, filter and page through player accounts. */
router.get(
  '/players',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL'
    const verified = typeof req.query.verified === 'string' ? req.query.verified : 'ALL'
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20))

    const where: string[] = ["u.role = 'PLAYER'"]
    const params: (string | number)[] = []

    if (q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR b.business_name LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like)
    }
    if (status === 'ACTIVE' || status === 'SUSPENDED') {
      where.push('u.status = ?')
      params.push(status)
    }
    if (verified === 'YES' || verified === 'NO') {
      where.push('u.email_verified = ?')
      params.push(verified === 'YES' ? 1 : 0)
    }

    const clause = `WHERE ${where.join(' AND ')}`

    const totalRow = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users u
       LEFT JOIN business_profiles b ON b.user_id = u.id
       ${clause}`,
      ...params,
    )
    const total = totalRow ? Number(totalRow.n) : 0

    const rows = many<PlayerRow>(
      `${BASE_SELECT} ${clause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    )

    res.json({
      players: rows.map(toPlayerSummary),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    })
  }),
)

/** Everything the administrator can see about one player. */
router.get(
  '/players/:id',
  wrap(async (req, res) => {
    const row = one<PlayerRow>(
      `${BASE_SELECT} WHERE u.id = ? AND u.role = 'PLAYER'`,
      String(req.params.id),
    )
    if (!row) {
      res.status(404).json({ error: 'That player does not exist.' })
      return
    }

    const profile = one<{
      business_name: string
      sector: string
      idea: string
      description: string
      problem: string
      product: string
      ambition: string | null
      updated_at: string
    }>('SELECT * FROM business_profiles WHERE user_id = ?', row.id)

    const history = many<{ id: string; action: string; detail: string; at: string }>(
      'SELECT id, action, detail, at FROM audit_logs WHERE user_id = ? ORDER BY at DESC LIMIT 30',
      row.id,
    )

    res.json({
      player: toPlayerSummary(row),
      business: profile
        ? {
            businessName: profile.business_name,
            sector: profile.sector,
            idea: profile.idea,
            description: profile.description,
            problem: profile.problem,
            product: profile.product,
            ambition: profile.ambition,
            updatedAt: profile.updated_at,
          }
        : null,
      progress: row.level_index === null
        ? null
        : {
            levelIndex: row.level_index,
            stageIndex: row.stage_index,
            xp: row.xp,
            cash: row.cash,
            reputation: row.reputation,
            completedLevels: parseCompleted(row.completed_levels),
          },
      history,
    })
  }),
)

/** Sets a player's account status. */
function setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', adminId: string) {
  const target = one<{ id: string; full_name: string; status: string }>(
    "SELECT id, full_name, status FROM users WHERE id = ? AND role = 'PLAYER'",
    id,
  )
  if (!target) return { ok: false as const, reason: 'not_found' }
  if (target.status === status) return { ok: false as const, reason: 'unchanged' }

  const now = new Date().toISOString()
  run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', status, now, id)
  audit(
    adminId,
    status === 'SUSPENDED' ? 'admin.player.suspend' : 'admin.player.restore',
    `${status === 'SUSPENDED' ? 'Suspended' : 'Restored'} ${target.full_name}`,
  )
  return { ok: true as const, name: target.full_name }
}

router.post(
  '/players/:id/suspend',
  wrap(async (req, res) => {
    const result = setStatus(String(req.params.id), 'SUSPENDED', req.user!.id)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'That player does not exist.' })
        return
      }
      res.status(400).json({ error: 'That account is already suspended.' })
      return
    }
    res.json({ ok: true, status: 'SUSPENDED' })
  }),
)

router.post(
  '/players/:id/restore',
  wrap(async (req, res) => {
    const result = setStatus(String(req.params.id), 'ACTIVE', req.user!.id)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'That player does not exist.' })
        return
      }
      res.status(400).json({ error: 'That account is already active.' })
      return
    }
    res.json({ ok: true, status: 'ACTIVE' })
  }),
)

export default router
