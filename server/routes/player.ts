import { Router } from 'express'
import { z } from 'zod'
import { parseList } from '../content'
import { getCompanyByOwner } from '../company'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { progressionSnapshot, recordEvidence } from '../progression'
import { newId } from '../security'
import { audit } from '../users'

/** The player's business profile, captured during onboarding (screen 05). */

const router = Router()

/**
 * Reads a JSON list column, preserving NULL.
 *
 * A NULL override column means "inherit the catalogue value", which is a
 * different thing from an intentionally empty list.
 */
function listOrNull(raw: string | null): string[] | null {
  return raw === null ? null : parseList(raw)
}

export interface ProfileRow {
  id: string
  user_id: string
  business_name: string
  sector: string
  idea: string
  description: string
  problem: string
  product: string
  ambition: string | null
  avatar_id: string
  created_at: string
  updated_at: string
}

export function toProfile(row: ProfileRow) {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    sector: row.sector,
    idea: row.idea,
    description: row.description,
    problem: row.problem,
    product: row.product,
    ambition: row.ambition,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const profileSchema = z.object({
  businessName: z.string().trim().min(2, 'Give your business a name.').max(60),
  sector: z.string().trim().min(2, 'Choose a sector.').max(60),
  idea: z.string().trim().min(10, 'Describe your idea in a little more detail.').max(400),
  description: z.string().trim().min(10, 'Describe what the business does.').max(600),
  problem: z.string().trim().min(10, 'Describe the problem you are solving.').max(600),
  product: z.string().trim().min(2, 'Say what you sell.').max(400),
  ambition: z.string().trim().max(120).optional(),
  avatarId: z.string().trim().min(1).max(40).optional(),
})

router.get(
  '/profile',
  wrap(async (req, res) => {
    const row = one<ProfileRow>('SELECT * FROM business_profiles WHERE user_id = ?', req.user!.id)
    res.json({ profile: row ? toProfile(row) : null })
  }),
)

router.put(
  '/profile',
  wrap(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details.' })
      return
    }

    const data = parsed.data
    const userId = req.user!.id
    const existing = one<ProfileRow>('SELECT * FROM business_profiles WHERE user_id = ?', userId)
    const now = new Date().toISOString()

    if (existing) {
      run(
        `UPDATE business_profiles
         SET business_name = ?, sector = ?, idea = ?, description = ?, problem = ?, product = ?, ambition = ?, avatar_id = ?, updated_at = ?
         WHERE user_id = ?`,
        data.businessName,
        data.sector,
        data.idea,
        data.description,
        data.problem,
        data.product,
        data.ambition ?? null,
        data.avatarId ?? existing.avatar_id,
        now,
        userId,
      )
    } else {
      run(
        `INSERT INTO business_profiles
           (id, user_id, business_name, sector, idea, description, problem, product, ambition, avatar_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        userId,
        data.businessName,
        data.sector,
        data.idea,
        data.description,
        data.problem,
        data.product,
        data.ambition ?? null,
        data.avatarId ?? 'founder-1',
        now,
        now,
      )
    }

    audit(userId, existing ? 'profile.update' : 'profile.create', `Business profile saved: ${data.businessName}`)

    const row = one<ProfileRow>('SELECT * FROM business_profiles WHERE user_id = ?', userId)
    res.json({ profile: row ? toProfile(row) : null })
  }),
)

/**
 * The player's live position in the game.
 *
 * Progress is *derived* by the server from the evidence the player submits —
 * never trusted from the client. `GET /progress` returns the authoritative
 * picture; `POST /progress/evidence` is the only way to move it forward. The
 * client cannot name a level, an xp figure or a cash balance: it can only say
 * what it did, and the rules decide what that earns.
 */

const evidenceSchema = z.object({
  /** Derived from the action on the client — never random. Scopes a retry. */
  idempotencyKey: z.string().trim().min(8).max(200),
  events: z
    .array(
      z.object({
        kind: z.enum([
          'visit_building',
          'talk_role',
          'do_interaction',
          'collect_info',
          'business_action',
        ]),
        target: z.string().trim().min(1).max(64),
      }),
    )
    .min(1)
    .max(24),
})

router.get(
  '/progress',
  wrap(async (req, res) => {
    res.json(progressionSnapshot(req.user!.id))
  }),
)

router.post(
  '/progress/evidence',
  wrap(async (req, res) => {
    const parsed = evidenceSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That evidence is not in a form we can record.' })
      return
    }

    const userId = req.user!.id
    const company = getCompanyByOwner(userId)
    const result = recordEvidence(userId, company?.id ?? null, parsed.data.events, parsed.data.idempotencyKey)

    if (result.recorded > 0) {
      audit(userId, 'progress.evidence', `Recorded ${result.recorded} objective evidence`)
    }

    res.json(result)
  }),
)

/**
 * The authored content the player application should apply.
 *
 * The stages, the fifteen Beginner levels and the default missions remain
 * defined by the client. This endpoint carries only what an administrator has
 * *changed*: sparse level overrides and any mission they have published. The
 * client merges both on top of its own catalogue, so the game's structure still
 * has exactly one owner while administrator edits take real effect.
 */
router.get(
  '/content',
  wrap(async (_req, res) => {
    const overrides = many<{
      level_id: string
      summary: string | null
      requirements: string | null
      unlocks: string | null
      xp_reward: number | null
      cash_reward: number | null
      reputation_reward: number | null
      active: number
    }>('SELECT * FROM level_overrides')

    const published = many<{
      id: string
      level_id: string
      title: string
      description: string
      instructions: string
      type: string
      xp_reward: number
      updated_at: string
    }>(
      `SELECT id, level_id, title, description, instructions, type, xp_reward, updated_at
       FROM missions WHERE status = 'PUBLISHED' ORDER BY updated_at DESC`,
    )

    const missions = published.map((mission) => {
      const objectives = many<{
        id: string
        kind: string
        type: string
        target: string
        text: string
        count: number
        hint: string | null
        hint_location: string | null
      }>(
        `SELECT id, kind, type, target, text, count, hint, hint_location
         FROM mission_objectives WHERE mission_id = ? ORDER BY ordinal ASC`,
        mission.id,
      )

      return {
        id: mission.id,
        levelId: mission.level_id,
        title: mission.title,
        briefing: mission.description,
        instructions: mission.instructions,
        type: mission.type,
        xpReward: Number(mission.xp_reward),
        updatedAt: mission.updated_at,
        objectives: objectives.map((objective) => ({
          id: objective.id,
          kind: objective.kind === 'optional' ? 'optional' : 'required',
          type: objective.type,
          target: objective.target,
          text: objective.text,
          count: Number(objective.count),
          hint: objective.hint,
          hintLocation: objective.hint_location,
        })),
      }
    })

    res.json({
      levels: overrides.map((row) => ({
        levelId: row.level_id,
        summary: row.summary,
        requirements: listOrNull(row.requirements),
        unlocks: listOrNull(row.unlocks),
        xpReward: row.xp_reward,
        cashReward: row.cash_reward,
        reputationReward: row.reputation_reward,
        active: row.active === 1,
      })),
      missions,
    })
  }),
)

export default router
