import { Router } from 'express'
import { z } from 'zod'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { newId } from '../security'
import { audit } from '../users'
import {
  LEVEL_IDS,
  MISSION_STATUSES,
  MISSION_TYPES,
  OBJECTIVE_KINDS,
  OBJECTIVE_TYPES,
  UNLOCK_KEYS,
  contentVocabulary,
  parseList,
  toMission,
  type LevelId,
  type MissionRow,
  type ObjectiveRow,
} from '../content'

/**
 * Administrator content management: stage/level tuning and the Mission Builder.
 *
 * The progression catalogue — five stages, fifteen Beginner levels, their ids
 * and titles — belongs to the player application and is not redefined here.
 * This area stores *overrides* on top of it and missions keyed to level ids, so
 * an administrator can retune the course without the server becoming the owner
 * of the game's structure.
 *
 * Every write is validated and recorded in the audit trail.
 */

const router = Router()

/* ------------------------------------------------------------- overrides -- */

interface OverrideRow {
  level_id: string
  summary: string | null
  requirements: string | null
  unlocks: string | null
  xp_reward: number | null
  cash_reward: number | null
  reputation_reward: number | null
  active: number
  updated_at: string
  updated_by: string | null
}

function toOverride(row: OverrideRow) {
  return {
    levelId: row.level_id,
    summary: row.summary,
    requirements: row.requirements === null ? null : parseList(row.requirements),
    unlocks: row.unlocks === null ? null : parseList(row.unlocks),
    xpReward: row.xp_reward,
    cashReward: row.cash_reward,
    reputationReward: row.reputation_reward,
    active: row.active === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

const overrideSchema = z.object({
  summary: z.string().trim().max(600).nullish(),
  requirements: z.array(z.string().trim().min(1).max(160)).max(10).nullish(),
  unlocks: z.array(z.enum(UNLOCK_KEYS)).max(10).nullish(),
  xpReward: z.number().int().min(0).max(100_000).nullish(),
  cashReward: z.number().int().min(0).max(1_000_000_000).nullish(),
  reputationReward: z.number().int().min(0).max(1000).nullish(),
  active: z.boolean().default(true),
})

/**
 * Per-level adoption, read from the mirrored player progress.
 *
 * This is what makes the level screen operational rather than decorative: an
 * administrator can see how many players actually reach a level before
 * deciding to retune it.
 */
function levelAdoption() {
  const rows = many<{ level_index: number; completed_levels: string }>(
    'SELECT level_index, completed_levels FROM player_progress',
  )

  const adoption = new Map<number, { reached: number; completed: number }>()
  for (const row of rows) {
    const done = parseList(row.completed_levels)
    const doneNumbers = done
      .map((id) => /^L(\d+)$/.exec(id))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))

    const highest = Math.max(row.level_index, ...doneNumbers, 0)
    for (let n = 1; n <= highest; n++) {
      const entry = adoption.get(n) ?? { reached: 0, completed: 0 }
      entry.reached += 1
      adoption.set(n, entry)
    }
    for (const n of doneNumbers) {
      const entry = adoption.get(n) ?? { reached: 0, completed: 0 }
      entry.completed += 1
      adoption.set(n, entry)
    }
  }
  return adoption
}

function missionCountsByLevel() {
  const rows = many<{ level_id: string; n: number; published: number }>(
    `SELECT level_id, COUNT(*) AS n, SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published
     FROM missions GROUP BY level_id`,
  )
  const map = new Map<string, { total: number; published: number }>()
  for (const row of rows) {
    map.set(row.level_id, { total: Number(row.n), published: Number(row.published) })
  }
  return map
}

/** Every level in the frozen catalogue, joined to its override and its usage. */
router.get(
  '/content/levels',
  wrap(async (_req, res) => {
    const overrides = many<OverrideRow>('SELECT * FROM level_overrides')
    const byId = new Map(overrides.map((row) => [row.level_id, toOverride(row)]))
    const adoption = levelAdoption()
    const missions = missionCountsByLevel()

    const levels = LEVEL_IDS.map((levelId) => {
      const index = Number(levelId.slice(1))
      const stat = adoption.get(index) ?? { reached: 0, completed: 0 }
      const missionStat = missions.get(levelId) ?? { total: 0, published: 0 }
      return {
        levelId,
        index,
        override: byId.get(levelId) ?? null,
        adoption: {
          reached: stat.reached,
          completed: stat.completed,
          completionRate: stat.reached === 0 ? 0 : stat.completed / stat.reached,
        },
        missions: missionStat,
      }
    })

    res.json({
      levels,
      overridden: byId.size,
      totalLevels: LEVEL_IDS.length,
      totalMissions: many<{ level_id: string }>('SELECT level_id FROM missions').length,
    })
  }),
)

/** One level with its full mission list, for the editor panel. */
router.get(
  '/content/levels/:levelId',
  wrap(async (req, res) => {
    const levelId = String(req.params.levelId)
    if (!LEVEL_IDS.includes(levelId as LevelId)) {
      res.status(404).json({ error: 'That level does not exist.' })
      return
    }

    const row = one<OverrideRow>('SELECT * FROM level_overrides WHERE level_id = ?', levelId)
    const missions = many<MissionRow>('SELECT * FROM missions WHERE level_id = ? ORDER BY updated_at DESC', levelId)

    res.json({
      levelId,
      override: row ? toOverride(row) : null,
      missions: missions.map((mission) => toMission(mission, objectivesFor(mission.id))),
    })
  }),
)

/** Create or replace a level's override. Nulls mean "inherit the catalogue". */
router.put(
  '/content/levels/:levelId',
  wrap(async (req, res) => {
    const levelId = String(req.params.levelId)
    if (!LEVEL_IDS.includes(levelId as LevelId)) {
      res.status(404).json({ error: 'That level does not exist.' })
      return
    }

    const parsed = overrideSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the level details.' })
      return
    }

    const data = parsed.data
    const adminId = req.user!.id
    const now = new Date().toISOString()

    run(
      `INSERT INTO level_overrides
         (level_id, summary, requirements, unlocks, xp_reward, cash_reward, reputation_reward, active, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(level_id) DO UPDATE SET
         summary = excluded.summary,
         requirements = excluded.requirements,
         unlocks = excluded.unlocks,
         xp_reward = excluded.xp_reward,
         cash_reward = excluded.cash_reward,
         reputation_reward = excluded.reputation_reward,
         active = excluded.active,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      levelId,
      data.summary ?? null,
      data.requirements ? JSON.stringify(data.requirements) : null,
      data.unlocks ? JSON.stringify(data.unlocks) : null,
      data.xpReward ?? null,
      data.cashReward ?? null,
      data.reputationReward ?? null,
      data.active ? 1 : 0,
      now,
      adminId,
    )

    audit(adminId, 'admin.level.update', `Retuned ${levelId}${data.active ? '' : ' (deactivated)'}`)

    const row = one<OverrideRow>('SELECT * FROM level_overrides WHERE level_id = ?', levelId)
    res.json({ override: row ? toOverride(row) : null })
  }),
)

/** Drop the override so the level returns to the catalogue's defaults. */
router.delete(
  '/content/levels/:levelId',
  wrap(async (req, res) => {
    const levelId = String(req.params.levelId)
    const existing = one<OverrideRow>('SELECT * FROM level_overrides WHERE level_id = ?', levelId)
    if (!existing) {
      res.status(400).json({ error: 'That level has no override to clear.' })
      return
    }

    run('DELETE FROM level_overrides WHERE level_id = ?', levelId)
    audit(req.user!.id, 'admin.level.reset', `Restored ${levelId} to the published catalogue`)
    res.json({ ok: true })
  }),
)

/* -------------------------------------------------------------- missions -- */

function objectivesFor(missionId: string): ObjectiveRow[] {
  return many<ObjectiveRow>(
    'SELECT * FROM mission_objectives WHERE mission_id = ? ORDER BY ordinal ASC',
    missionId,
  )
}

const objectiveSchema = z.object({
  kind: z.enum(OBJECTIVE_KINDS),
  type: z.enum(OBJECTIVE_TYPES),
  target: z.string().trim().min(1, 'Every objective needs a target.').max(60),
  text: z.string().trim().min(3, 'Describe the objective for the player.').max(180),
  count: z.number().int().min(1).max(1000),
  hint: z.string().trim().max(200).nullish(),
  hintLocation: z.string().trim().max(100).nullish(),
})

const textList = (max: number, itemMax: number) =>
  z.array(z.string().trim().min(1).max(itemMax)).max(max)

const missionSchema = z.object({
  levelId: z.enum(LEVEL_IDS),
  title: z.string().trim().min(2, 'Give the mission a title.').max(90),
  description: z.string().trim().min(8, 'Write the briefing the player will read.').max(1500),
  instructions: z.string().trim().max(1500),
  type: z.enum(MISSION_TYPES),
  xpReward: z.number().int().min(0).max(100_000),
  prerequisites: textList(10, 180),
  npcRequirements: textList(10, 140),
  locationRequirements: textList(10, 140),
  completionConditions: textList(10, 220),
  evaluationCriteria: textList(10, 220),
  failureConditions: textList(10, 220),
  recoveryInstructions: z.string().trim().max(1500),
  objectives: z.array(objectiveSchema).min(1, 'A mission needs at least one objective.').max(15),
}).refine(
  (mission) => mission.objectives.some((objective) => objective.kind === 'required'),
  { message: 'A mission needs at least one required objective, or it can never be completed.' },
)

/** Replace a mission's objectives. Ids are stable and level-scoped. */
function writeObjectives(missionId: string, levelId: string, objectives: z.infer<typeof objectiveSchema>[]) {
  run('DELETE FROM mission_objectives WHERE mission_id = ?', missionId)
  objectives.forEach((objective, index) => {
    run(
      `INSERT INTO mission_objectives
         (id, mission_id, ordinal, kind, type, target, text, count, hint, hint_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${levelId}.o${index + 1}`,
      missionId,
      index + 1,
      objective.kind,
      objective.type,
      objective.target,
      objective.text,
      objective.count,
      objective.hint ?? null,
      objective.hintLocation ?? null,
    )
  })
}

/** Search, filter and page through authored missions. */
router.get(
  '/content/missions',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const levelId = typeof req.query.levelId === 'string' ? req.query.levelId : 'ALL'
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL'
    const type = typeof req.query.type === 'string' ? req.query.type : 'ALL'

    const where: string[] = []
    const params: (string | number)[] = []

    if (q) {
      where.push('(title LIKE ? OR description LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    if (LEVEL_IDS.includes(levelId as LevelId)) {
      where.push('level_id = ?')
      params.push(levelId)
    }
    if (MISSION_STATUSES.includes(status as (typeof MISSION_STATUSES)[number])) {
      where.push('status = ?')
      params.push(status)
    }
    if (MISSION_TYPES.includes(type as (typeof MISSION_TYPES)[number])) {
      where.push('type = ?')
      params.push(type)
    }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const rows = many<MissionRow>(
      `SELECT * FROM missions ${clause} ORDER BY level_id ASC, updated_at DESC`,
      ...params,
    )

    res.json({
      missions: rows.map((row) => toMission(row, objectivesFor(row.id))),
      total: rows.length,
      summary: {
        total: many<{ level_id: string }>('SELECT level_id FROM missions').length,
        published: many<{ level_id: string }>(
          "SELECT level_id FROM missions WHERE status = 'PUBLISHED'",
        ).length,
        draft: many<{ level_id: string }>("SELECT level_id FROM missions WHERE status = 'DRAFT'").length,
      },
    })
  }),
)

/** A single mission, with its objectives in order. */
router.get(
  '/content/missions/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const row = one<MissionRow>('SELECT * FROM missions WHERE id = ?', id)
    if (!row) {
      res.status(404).json({ error: 'That mission does not exist.' })
      return
    }
    res.json({ mission: toMission(row, objectivesFor(row.id)) })
  }),
)

router.post(
  '/content/missions',
  wrap(async (req, res) => {
    const parsed = missionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the mission details.' })
      return
    }

    const data = parsed.data
    const adminId = req.user!.id
    const now = new Date().toISOString()
    const id = newId()

    run(
      `INSERT INTO missions
         (id, level_id, title, description, instructions, type, xp_reward, status, prerequisites,
          npc_requirements, location_requirements, completion_conditions, evaluation_criteria,
          failure_conditions, recovery_instructions, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.levelId,
      data.title,
      data.description,
      data.instructions,
      data.type,
      data.xpReward,
      JSON.stringify(data.prerequisites),
      JSON.stringify(data.npcRequirements),
      JSON.stringify(data.locationRequirements),
      JSON.stringify(data.completionConditions),
      JSON.stringify(data.evaluationCriteria),
      JSON.stringify(data.failureConditions),
      data.recoveryInstructions,
      now,
      now,
      adminId,
    )
    writeObjectives(id, data.levelId, data.objectives)

    audit(adminId, 'admin.mission.create', `Drafted "${data.title}" for ${data.levelId}`)

    const row = one<MissionRow>('SELECT * FROM missions WHERE id = ?', id)
    res.status(201).json({ mission: row ? toMission(row, objectivesFor(id)) : null })
  }),
)

router.put(
  '/content/missions/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<MissionRow>('SELECT * FROM missions WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That mission does not exist.' })
      return
    }

    const parsed = missionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the mission details.' })
      return
    }

    const data = parsed.data
    const adminId = req.user!.id

    run(
      `UPDATE missions SET
         level_id = ?, title = ?, description = ?, instructions = ?, type = ?, xp_reward = ?,
         prerequisites = ?, npc_requirements = ?, location_requirements = ?, completion_conditions = ?,
         evaluation_criteria = ?, failure_conditions = ?, recovery_instructions = ?, updated_at = ?
       WHERE id = ?`,
      data.levelId,
      data.title,
      data.description,
      data.instructions,
      data.type,
      data.xpReward,
      JSON.stringify(data.prerequisites),
      JSON.stringify(data.npcRequirements),
      JSON.stringify(data.locationRequirements),
      JSON.stringify(data.completionConditions),
      JSON.stringify(data.evaluationCriteria),
      JSON.stringify(data.failureConditions),
      data.recoveryInstructions,
      new Date().toISOString(),
      id,
    )
    writeObjectives(id, data.levelId, data.objectives)

    audit(adminId, 'admin.mission.update', `Updated "${data.title}" (${data.levelId})`)

    const row = one<MissionRow>('SELECT * FROM missions WHERE id = ?', id)
    res.json({ mission: row ? toMission(row, objectivesFor(id)) : null })
  }),
)

/**
 * Publishing is what makes a mission visible to players: only published
 * missions are served by the player content feed.
 */
router.post(
  '/content/missions/:id/:action',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const action = String(req.params.action)
    if (action !== 'publish' && action !== 'unpublish') {
      res.status(404).json({ error: 'Unknown action.' })
      return
    }

    const existing = one<MissionRow>('SELECT id, title, level_id, status FROM missions WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That mission does not exist.' })
      return
    }

    const next = action === 'publish' ? 'PUBLISHED' : 'DRAFT'
    if (existing.status === next) {
      res.status(400).json({ error: `That mission is already ${next.toLowerCase()}.` })
      return
    }

    run(
      'UPDATE missions SET status = ?, updated_at = ? WHERE id = ?',
      next,
      new Date().toISOString(),
      id,
    )
    audit(
      req.user!.id,
      action === 'publish' ? 'admin.mission.publish' : 'admin.mission.unpublish',
      `${action === 'publish' ? 'Published' : 'Unpublished'} "${existing.title}" (${existing.level_id})`,
    )

    const row = one<MissionRow>('SELECT * FROM missions WHERE id = ?', id)
    res.json({ mission: row ? toMission(row, objectivesFor(id)) : null })
  }),
)

router.delete(
  '/content/missions/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<MissionRow>('SELECT id, title, status FROM missions WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That mission does not exist.' })
      return
    }
    if (existing.status === 'PUBLISHED') {
      res.status(400).json({ error: 'Unpublish this mission before deleting it.' })
      return
    }

    run('DELETE FROM missions WHERE id = ?', id)
    audit(req.user!.id, 'admin.mission.delete', `Deleted "${existing.title}"`)
    res.json({ ok: true })
  }),
)

/** The controlled vocabularies the authoring screens render. */
router.get(
  '/content/meta',
  wrap(async (_req, res) => {
    res.json(contentVocabulary())
  }),
)

export default router
