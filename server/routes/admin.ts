import { Router } from 'express'
import { many, one } from '../db'
import { requirePermission, wrap } from '../middleware'
import adminContentRoutes from './adminContent'
import adminSimulationRoutes from './adminSimulation'
import adminSystemRoutes from './adminSystem'
import adminWorldRoutes from './adminWorld'
import playerAdminRoutes from './adminPlayers'

/**
 * The administrator's view of the platform.
 *
 * Every figure here is aggregated from stored rows. Nothing is decorative: if a
 * number cannot be sourced from the database it is not reported.
 *
 * Level and stage *names* deliberately do not appear in this payload. They live
 * in the player application's frozen progression catalogue, and the client
 * joins these counts onto it — so the contract is defined in exactly one place.
 */

const router = Router()

/** A player counts as online if they made an authenticated request recently. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000
/** Progress that has not moved in this long is surfaced as an alert. */
const STALLED_DAYS = 14
/** The Beginner stage is fixed at 15 levels; other stages follow the same span. */
const LEVELS_PER_STAGE = 15
const MAX_LEVEL = LEVELS_PER_STAGE * 5

interface ProgressLite {
  user_id: string
  stage_index: number
  level_index: number
  completed_levels: string
  updated_at: string
}

function parseCompleted(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

function countOf(sql: string, ...params: (string | number)[]): number {
  const row = one<{ n: number }>(sql, ...params)
  return row ? Number(row.n) : 0
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function levelNumber(id: string): number {
  const match = /^L(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

router.get(
  '/overview',
  requirePermission('insights'),
  wrap(async (_req, res) => {
    const now = Date.now()

    // --- players -------------------------------------------------------
    const totalPlayers = countOf("SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER'")
    const verifiedPlayers = countOf(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND email_verified = 1",
    )
    const suspendedPlayers = countOf(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND status = 'SUSPENDED'",
    )
    const onlinePlayers = countOf(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND last_seen_at IS NOT NULL AND last_seen_at >= ?",
      new Date(now - ONLINE_WINDOW_MS).toISOString(),
    )
    const newThisWeek = countOf(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER' AND created_at >= ?",
      daysAgoIso(7),
    )
    const staffCount = countOf("SELECT COUNT(*) AS n FROM users WHERE role IN ('ADMIN','LECTURER')")

    // --- companies -----------------------------------------------------
    const totalCompanies = countOf('SELECT COUNT(*) AS n FROM business_profiles')
    const bySector = many<{ sector: string; n: number }>(
      `SELECT sector, COUNT(*) AS n FROM business_profiles GROUP BY sector ORDER BY n DESC, sector ASC`,
    ).map((r) => ({ sector: r.sector, count: Number(r.n) }))

    // --- progression ---------------------------------------------------
    const progressRows = many<ProgressLite>(
      'SELECT user_id, stage_index, level_index, completed_levels, updated_at FROM player_progress',
    )
    const startedPlayers = progressRows.length

    const perLevel = new Map<number, { completed: number; reached: number }>()
    let highestLevelSeen = 0

    for (const row of progressRows) {
      const done = new Set(parseCompleted(row.completed_levels))
      let reachedThisRow = row.level_index
      for (const id of done) {
        const n = levelNumber(id)
        if (n > reachedThisRow) reachedThisRow = n
      }
      if (reachedThisRow > highestLevelSeen) highestLevelSeen = reachedThisRow

      for (let n = 1; n <= reachedThisRow; n++) {
        const entry = perLevel.get(n) ?? { completed: 0, reached: 0 }
        entry.reached += 1
        perLevel.set(n, entry)
      }
      for (const id of done) {
        const n = levelNumber(id)
        if (n < 1) continue
        const entry = perLevel.get(n) ?? { completed: 0, reached: 0 }
        entry.completed += 1
        if (entry.reached < entry.completed) entry.reached = entry.completed
        perLevel.set(n, entry)
      }
    }

    const levels = Array.from(perLevel.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([index, stat]) => ({
        levelId: `L${index}`,
        index,
        completed: stat.completed,
        reached: stat.reached,
        completionRate: stat.reached === 0 ? 0 : stat.completed / stat.reached,
        dropoff: stat.reached - stat.completed,
      }))

    const hardestLevels = [...levels]
      .filter((l) => l.reached > 0)
      .sort((a, b) => b.dropoff - a.dropoff || a.completionRate - b.completionRate)
      .slice(0, 5)

    const stages = Array.from({ length: 5 }, (_unused, i) => {
      const stageIndex = i + 1
      const first = (stageIndex - 1) * LEVELS_PER_STAGE + 1
      const last = stageIndex * LEVELS_PER_STAGE
      const entered = progressRows.filter((r) => r.level_index >= first).length
      const completed = progressRows.filter((r) => {
        const done = new Set(parseCompleted(r.completed_levels))
        for (let n = first; n <= last; n++) if (!done.has(`L${n}`)) return false
        return true
      }).length
      return {
        stageIndex,
        entered,
        completed,
        completionRate: entered === 0 ? 0 : completed / entered,
      }
    })

    const totalCompletions = many<{ completed_levels: string }>(
      'SELECT completed_levels FROM player_progress',
    ).reduce((sum, r) => sum + parseCompleted(r.completed_levels).length, 0)
    const possibleCompletions = startedPlayers * MAX_LEVEL
    const overallCompletionRate = possibleCompletions === 0 ? 0 : totalCompletions / possibleCompletions

    const averageLevel =
      startedPlayers === 0
        ? 0
        : progressRows.reduce((sum, r) => sum + r.level_index, 0) / startedPlayers

    // --- activity feed -------------------------------------------------
    const activity = many<{
      id: string
      action: string
      detail: string
      at: string
      full_name: string | null
      role: string | null
    }>(
      `SELECT a.id, a.action, a.detail, a.at, u.full_name, u.role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.at DESC
       LIMIT 25`,
    ).map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      at: r.at,
      actor: r.full_name,
      role: r.role,
    }))

    // --- registrations, last 14 days -----------------------------------
    const registrations = many<{ day: string; n: number }>(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
       FROM users
       WHERE role = 'PLAYER' AND created_at >= ?
       GROUP BY day
       ORDER BY day ASC`,
      daysAgoIso(14),
    ).map((r) => ({ day: r.day, count: Number(r.n) }))

    // --- alerts, derived from the data above ---------------------------
    const alerts: { level: 'info' | 'warning' | 'critical'; title: string; detail: string }[] = []

    const unverified = totalPlayers - verifiedPlayers
    if (unverified > 0) {
      alerts.push({
        level: 'info',
        title: `${unverified} account${unverified === 1 ? '' : 's'} awaiting email verification`,
        detail: 'These players cannot sign in until they confirm their address.',
      })
    }
    if (suspendedPlayers > 0) {
      alerts.push({
        level: 'warning',
        title: `${suspendedPlayers} suspended account${suspendedPlayers === 1 ? '' : 's'}`,
        detail: 'Suspended players are refused access until an administrator restores them.',
      })
    }

    const stalled = progressRows.filter(
      (r) => new Date(r.updated_at).getTime() < now - STALLED_DAYS * 86_400_000,
    ).length
    if (stalled > 0) {
      alerts.push({
        level: 'warning',
        title: `${stalled} player${stalled === 1 ? '' : 's'} stalled`,
        detail: `No progression recorded in the last ${STALLED_DAYS} days.`,
      })
    }

    if (levels.length === 0) {
      alerts.push({
        level: 'info',
        title: 'No gameplay data yet',
        detail: 'Progression figures appear once players enter the city.',
      })
    }

    if (alerts.length === 0) {
      alerts.push({
        level: 'info',
        title: 'All systems nominal',
        detail: 'No account, progression or simulation issues detected.',
      })
    }

    res.json({
      players: {
        total: totalPlayers,
        verified: verifiedPlayers,
        unverified,
        online: onlinePlayers,
        suspended: suspendedPlayers,
        newThisWeek,
        staff: staffCount,
      },
      companies: { total: totalCompanies, bySector },
      progression: {
        started: startedPlayers,
        overallCompletionRate,
        averageLevel,
        stages,
        levels,
        hardestLevels,
        levelsPerStage: LEVELS_PER_STAGE,
        maxLevel: MAX_LEVEL,
      },
      activity,
      registrations,
      alerts,
    })
  }),
)

// Content authoring: level overrides and the Mission Builder.
router.use(requirePermission('content'), adminContentRoutes)

// World management: the crowd, investors, sectors and the city.
router.use(requirePermission('world'), adminWorldRoutes)

// Player accounts.
router.use(requirePermission('players'), playerAdminRoutes)

// Simulation control: the economy, the rules, the regulations and the events.
router.use(requirePermission('simulation'), adminSimulationRoutes)

// Insights and system control. Each route carries its own permission check, so
// a read-only administrator can be given the logs without the settings.
router.use(adminSystemRoutes)

export default router
