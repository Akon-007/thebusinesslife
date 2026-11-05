import { many, one, run, transaction } from './db'
import { newId } from './security'
import { RULE_VERSIONS } from './rules'
import { emitEvent } from './outbox'
import { getCompanyByOwner } from './company'
import { cashBalanceKobo, fromKobo } from './finance'
import { parseList } from './content'

/**
 * The progression authority.
 *
 * The server — not the player application — decides what a player has earned.
 * The client submits *evidence* (an objective it believes it just satisfied,
 * e.g. "I spoke to a mentor"); this module validates that evidence against the
 * frozen catalogue, records it append-only, and derives xp, reputation and the
 * current level from the recorded rows.
 *
 * Nothing here can be talked into granting a level or cash: a level is awarded
 * only when every required objective has matching evidence, and money never
 * enters through progression at all. `level_results` deliberately has no cash
 * column — cash only ever moves through the ledger.
 */

export type ObjectiveType =
  | 'visit_building'
  | 'talk_role'
  | 'do_interaction'
  | 'collect_info'
  | 'business_action'
  | 'reach_stat'

export const OBJECTIVE_TYPES: ObjectiveType[] = [
  'visit_building',
  'talk_role',
  'do_interaction',
  'collect_info',
  'business_action',
  'reach_stat',
]

export interface Objective {
  id: string
  text: string
  type: ObjectiveType
  target: string
  count: number
  kind?: 'required' | 'optional'
  hint?: string
  hintLocation?: string
}

export interface Mission {
  levelId: string
  title: string
  briefing: string
  objectives: Objective[]
}

export interface LevelDef {
  id: string
  index: number
  stageId: string
  title: string
  summary: string
  unlocks: string[]
  requirements: string[]
  /** Experience granted when the level is completed. */
  xpReward: number
  /** Reputation granted when the level is completed. */
  reputationReward: number
}

const LEVELS_PER_STAGE = 15

/**
 * The fifteen Beginner levels.
 *
 * This is the server's copy of the frozen design contract. It is deliberately
 * its own list rather than a re-export of the client catalogue: the server has
 * to be able to judge progress without trusting anything the client sends.
 * Cash rewards are absent by design — progression never pays out money.
 */
const LEVELS: LevelDef[] = [
  { id: 'L1', index: 1, stageId: 'beginner', title: 'The Idea', summary: 'You have a business idea. Go and test it against someone who has done it before.', unlocks: ['phone'], requirements: ['Write down your business idea', 'Define the problem you are solving'], xpReward: 60, reputationReward: 1 },
  { id: 'L2', index: 2, stageId: 'beginner', title: 'Market Discovery', summary: 'Walk the market and find real customers. Listen before you sell.', unlocks: ['market'], requirements: ['Interview 3 potential customers', 'Identify a target market'], xpReward: 80, reputationReward: 2 },
  { id: 'L3', index: 3, stageId: 'beginner', title: 'Business Planning', summary: 'Price your product against the market and write a plan you can defend.', unlocks: ['business_plan'], requirements: ['Compare market prices', 'Write a business plan'], xpReward: 100, reputationReward: 2 },
  { id: 'L4', index: 4, stageId: 'beginner', title: 'Company Formation', summary: 'Head to the registry. Speak to the officials. Register the company.', unlocks: ['company_registration'], requirements: ['Visit the registration office', 'Register the business name'], xpReward: 120, reputationReward: 3 },
  { id: 'L5', index: 5, stageId: 'beginner', title: 'Meet the Requirements', summary: 'Regulators want paperwork. Collect the requirements and satisfy them.', unlocks: [], requirements: ['Collect 3 regulatory requirements', 'Complete registration'], xpReward: 140, reputationReward: 3 },
  { id: 'L6', index: 6, stageId: 'beginner', title: 'Open for Business', summary: 'Find a premises in a commercial area and put your name on the door.', unlocks: [], requirements: ['Secure a trading premises', 'Open the business'], xpReward: 160, reputationReward: 4 },
  { id: 'L7', index: 7, stageId: 'beginner', title: 'Build Your Founding Team', summary: 'You cannot do this alone. Recruit people who are better than you at something.', unlocks: ['hire_team'], requirements: ['Review 3 candidates', 'Hire your founding team'], xpReward: 180, reputationReward: 4 },
  { id: 'L8', index: 8, stageId: 'beginner', title: 'Find Your First Capital', summary: 'The bank wants numbers. Go and learn what they will ask for.', unlocks: ['fundraising'], requirements: ['Discuss loan terms with a bank', 'Open a business account'], xpReward: 200, reputationReward: 5 },
  { id: 'L9', index: 9, stageId: 'beginner', title: 'Prepare to Pitch', summary: 'Know your competitors, then build a deck that answers every hard question.', unlocks: ['pitch'], requirements: ['Research 2 competitors', 'Build your pitch deck'], xpReward: 220, reputationReward: 5 },
  { id: 'L10', index: 10, stageId: 'beginner', title: 'Enter the Investment Market', summary: 'Investors live in the business district. Make yourself known to them.', unlocks: ['investors'], requirements: ['Meet 3 investors', 'Gauge investment interest'], xpReward: 240, reputationReward: 6 },
  { id: 'L11', index: 11, stageId: 'beginner', title: 'Handle Your First Rejection', summary: 'You will be turned down. Learn from it and go again.', unlocks: [], requirements: ['Pitch twice', 'Review the rejection feedback'], xpReward: 260, reputationReward: 6 },
  { id: 'L12', index: 12, stageId: 'beginner', title: 'Secure Pre-seed Investment', summary: 'One investor believes you. Close the round.', unlocks: [], requirements: ['Close a pre-seed round'], xpReward: 320, reputationReward: 10 },
  { id: 'L13', index: 13, stageId: 'beginner', title: 'Prepare for Launch', summary: 'Get stock, logistics and positioning ready before the doors open.', unlocks: [], requirements: ['Negotiate 2 supplier quotes', 'Stock your inventory'], xpReward: 340, reputationReward: 8 },
  { id: 'L14', index: 14, stageId: 'beginner', title: 'First Board & Business Review', summary: 'Your investors want governance. Sit down and answer for the numbers.', unlocks: ['board'], requirements: ['Hold a board meeting', 'Build reputation'], xpReward: 380, reputationReward: 12 },
  { id: 'L15', index: 15, stageId: 'beginner', title: 'Launch & Break-even', summary: 'Launch the product and earn back everything you have spent.', unlocks: ['launch'], requirements: ['Launch the product', 'Break even'], xpReward: 600, reputationReward: 20 },
]

const MISSIONS: Mission[] = [
  {
    levelId: 'L1',
    title: 'The Idea',
    briefing: 'You have an idea burning a hole in your pocket. Before you spend a naira on it, go and find a mentor at the business hub in Victoria Island and let them kick it around.',
    objectives: [
      { id: 'L1.o1', text: 'Visit the Idera Business Hub', type: 'visit_building', target: 'business_hub', count: 1, hintLocation: 'Victoria Island Business District' },
      { id: 'L1.o2', text: 'Speak with a mentor', type: 'talk_role', target: 'mentor', count: 1 },
      { id: 'L1.o3', text: 'Collect mentorship advice', type: 'collect_info', target: 'mentorship_advice', count: 1 },
      { id: 'L1.o4', text: 'Write down your business idea', type: 'business_action', target: 'write_business_idea', count: 1, hint: 'Open the Business panel' },
      { id: 'L1.o5', text: 'Define the problem you are solving', type: 'business_action', target: 'define_problem', count: 1, hint: 'Open the Business panel after writing the idea' },
    ],
  },
  {
    levelId: 'L2',
    title: 'Market Discovery',
    briefing: 'Do not build for yourself. Get into Balogun Market and find three real potential customers. Ask about their needs, not about your product.',
    objectives: [
      { id: 'L2.o1', text: 'Visit Balogun Market', type: 'visit_building', target: 'market', count: 1, hintLocation: 'Balogun Market' },
      { id: 'L2.o2', text: 'Find 3 potential customers in the market', type: 'collect_info', target: 'customer_need', count: 3, hint: 'Click customers and interview them' },
      { id: 'L2.o3', text: 'Identify a target market', type: 'business_action', target: 'define_target_market', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L3',
    title: 'Business Planning',
    briefing: 'A plan without numbers is a wish. Compare what the market charges, then put your plan on paper.',
    objectives: [
      { id: 'L3.o1', text: 'Compare 2 market prices with traders', type: 'collect_info', target: 'market_price', count: 2, hintLocation: 'Balogun Market' },
      { id: 'L3.o2', text: 'Record your pricing benchmark', type: 'business_action', target: 'compare_market_prices', count: 1, hint: 'Open the Business panel' },
      { id: 'L3.o3', text: 'Write your business plan', type: 'business_action', target: 'write_business_plan', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L4',
    title: 'Company Formation',
    briefing: 'An idea is not a company. Head to the Corporate Affairs registry, speak to the official on the desk, and register the name.',
    objectives: [
      { id: 'L4.o1', text: 'Visit the Corporate Affairs registry', type: 'visit_building', target: 'registration_office', count: 1, hintLocation: 'Civic Centre' },
      { id: 'L4.o2', text: 'Speak with a government official', type: 'talk_role', target: 'gov_official', count: 1 },
      { id: 'L4.o3', text: 'Register your company', type: 'business_action', target: 'register_company', count: 1, hint: 'Use the Registry interaction' },
    ],
  },
  {
    levelId: 'L5',
    title: 'Meet the Requirements',
    briefing: 'Registration comes with conditions. Collect every requirement they hand you and close them out.',
    objectives: [
      { id: 'L5.o1', text: 'Collect 3 regulatory requirements', type: 'collect_info', target: 'requirement_info', count: 3, hintLocation: 'Civic Centre' },
      { id: 'L5.o2', text: 'Complete your registration', type: 'business_action', target: 'complete_registration', count: 1 },
    ],
  },
  {
    levelId: 'L6',
    title: 'Open for Business',
    briefing: 'You need a front door. Find premises in a commercial area and open up.',
    objectives: [
      { id: 'L6.o1', text: 'Secure a trading premises', type: 'business_action', target: 'lease_premises', count: 1, hintLocation: 'Broad Street Commercial' },
      { id: 'L6.o2', text: 'Open the business', type: 'business_action', target: 'open_business', count: 1 },
    ],
  },
  {
    levelId: 'L7',
    title: 'Build Your Founding Team',
    briefing: 'You cannot run this alone. Find people around the city, review what they bring, and hire a founding team.',
    objectives: [
      { id: 'L7.o1', text: 'Review 3 candidates', type: 'collect_info', target: 'candidate_profile', count: 3, hint: 'Talk to employees around the city' },
      { id: 'L7.o2', text: 'Hire your founding team', type: 'business_action', target: 'hire_team', count: 1 },
    ],
  },
  {
    levelId: 'L8',
    title: 'Find Your First Capital',
    briefing: 'Banks do not lend to dreams. Learn the terms before you ask for money.',
    objectives: [
      { id: 'L8.o1', text: 'Discuss loan terms with a bank representative', type: 'talk_role', target: 'bank_rep', count: 1, hintLocation: 'Marina Capital Bank' },
      { id: 'L8.o2', text: 'Collect 2 sets of funding terms', type: 'collect_info', target: 'funding_terms', count: 2 },
      { id: 'L8.o3', text: 'Open a business account', type: 'business_action', target: 'open_bank_account', count: 1 },
    ],
  },
  {
    levelId: 'L9',
    title: 'Prepare to Pitch',
    briefing: 'Investors will ask about your competition before they ask about you. Know the field, then build the deck.',
    objectives: [
      { id: 'L9.o1', text: 'Research 2 competitors', type: 'collect_info', target: 'competitor_info', count: 2, hint: 'Business owners and competitors know the field' },
      { id: 'L9.o2', text: 'Build your pitch deck', type: 'business_action', target: 'build_pitch_deck', count: 1, hint: 'Open the Business panel' },
    ],
  },
  {
    levelId: 'L10',
    title: 'Enter the Investment Market',
    briefing: 'Money is in the business district. Introduce yourself to the investors and find out who is actually interested.',
    objectives: [
      { id: 'L10.o1', text: 'Visit the business hub', type: 'visit_building', target: 'business_hub', count: 1, hintLocation: 'Victoria Island Business District' },
      { id: 'L10.o2', text: 'Meet 3 investors', type: 'talk_role', target: 'investor', count: 3 },
      { id: 'L10.o3', text: 'Gauge investment interest', type: 'collect_info', target: 'investment_interest', count: 3 },
    ],
  },
  {
    levelId: 'L11',
    title: 'Handle Your First Rejection',
    briefing: 'You will be told no. It is part of the job. Pitch again, and actually read the feedback.',
    objectives: [
      { id: 'L11.o1', text: 'Pitch to investors (twice)', type: 'do_interaction', target: 'pitch', count: 2 },
      { id: 'L11.o2', text: 'Review the rejection feedback', type: 'business_action', target: 'review_rejection', count: 1 },
    ],
  },
  {
    levelId: 'L12',
    title: 'Secure Pre-seed Investment',
    briefing: 'One of them believes in you. Go back, pitch it properly, and close the round.',
    objectives: [
      { id: 'L12.o1', text: 'Deliver a successful pitch', type: 'do_interaction', target: 'pitch', count: 1 },
      { id: 'L12.o2', text: 'Close your pre-seed round', type: 'business_action', target: 'secure_preseed', count: 1 },
    ],
  },
  {
    levelId: 'L13',
    title: 'Prepare for Launch',
    briefing: 'Before the doors open, the shelves must be full. Negotiate with suppliers and stock up.',
    objectives: [
      { id: 'L13.o1', text: 'Negotiate 2 supplier quotes', type: 'collect_info', target: 'supplier_quote', count: 2, hintLocation: 'Apapa Industrial Area' },
      { id: 'L13.o2', text: 'Stock your inventory', type: 'business_action', target: 'stock_inventory', count: 1 },
    ],
  },
  {
    levelId: 'L14',
    title: 'First Board & Business Review',
    briefing: 'Your investors now have a seat at the table. Get your accountant in and hold the first board meeting.',
    objectives: [
      { id: 'L14.o1', text: 'Consult a lawyer or accountant', type: 'talk_role', target: 'lawyer_accountant', count: 1 },
      { id: 'L14.o2', text: 'Hold your first board meeting', type: 'business_action', target: 'hold_board_meeting', count: 1 },
      { id: 'L14.o3', text: 'Build your reputation to 20', type: 'reach_stat', target: 'reputation', count: 20 },
    ],
  },
  {
    levelId: 'L15',
    title: 'Launch & Break-even',
    briefing: 'This is it. Launch the product and earn back every naira you have put in.',
    objectives: [
      { id: 'L15.o1', text: 'Launch the product', type: 'business_action', target: 'launch_product', count: 1 },
      { id: 'L15.o2', text: 'Reach ₦2,000,000 in cash', type: 'reach_stat', target: 'cash', count: 2000000 },
      { id: 'L15.o3', text: 'Have 3 people on your team', type: 'reach_stat', target: 'team', count: 3 },
    ],
  },
]

const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l])) as Record<string, LevelDef>
const MISSION_BY_LEVEL = Object.fromEntries(MISSIONS.map((m) => [m.levelId, m])) as Record<string, Mission>

/* --------------------------------------------- administrator overrides ---- */

interface OverrideRow {
  level_id: string
  summary: string | null
  requirements: string | null
  unlocks: string | null
  xp_reward: number | null
  reputation_reward: number | null
  active: number
}

interface PublishedMissionRow {
  id: string
  level_id: string
  title: string
  description: string
  instructions: string
}

interface PublishedObjectiveRow {
  id: string
  kind: string
  type: string
  target: string
  text: string
  count: number
  hint: string | null
  hint_location: string | null
}

/** A level as the server should judge it: the catalogue, plus published edits. */
export function resolvedLevel(levelId: string): LevelDef | undefined {
  const base = LEVEL_BY_ID[levelId]
  if (!base) return undefined

  const override = one<OverrideRow>('SELECT * FROM level_overrides WHERE level_id = ? AND active = 1', levelId)
  if (!override) return base

  return {
    ...base,
    summary: override.summary ?? base.summary,
    requirements: override.requirements === null ? base.requirements : parseList(override.requirements),
    unlocks: override.unlocks === null ? base.unlocks : parseList(override.unlocks),
    xpReward: override.xp_reward ?? base.xpReward,
    reputationReward: override.reputation_reward ?? base.reputationReward,
  }
}

/** The mission for a level: an authored, published one if there is one. */
export function resolvedMission(levelId: string): Mission | undefined {
  const published = one<PublishedMissionRow>(
    `SELECT id, level_id, title, description, instructions FROM missions
     WHERE level_id = ? AND status = 'PUBLISHED' ORDER BY updated_at DESC LIMIT 1`,
    levelId,
  )
  if (!published) return MISSION_BY_LEVEL[levelId]

  const objectives = many<PublishedObjectiveRow>(
    `SELECT id, kind, type, target, text, count, hint, hint_location
     FROM mission_objectives WHERE mission_id = ? ORDER BY ordinal ASC`,
    published.id,
  )

  return {
    levelId: published.level_id,
    title: published.title,
    briefing: published.instructions ? `${published.description}\n\n${published.instructions}` : published.description,
    objectives: objectives.map((o) => ({
      id: o.id,
      text: o.text,
      type: o.type as ObjectiveType,
      target: o.target,
      count: Number(o.count),
      kind: o.kind === 'optional' ? 'optional' : 'required',
      hint: o.hint ?? undefined,
      hintLocation: o.hint_location ?? undefined,
    })),
  }
}

export function levelForIndex(index: number): LevelDef | undefined {
  return LEVELS.find((l) => l.index === index)
}

export function levelsPerStage(): number {
  return LEVELS_PER_STAGE
}

/* ------------------------------------------------------------- types ------ */

export interface ObjectiveProgress {
  objectiveId: string
  progress: number
  done: boolean
  kind: 'required' | 'optional'
}

export interface PlayerProgressRow {
  user_id: string
  stage_index: number
  level_index: number
  xp: number
  cash: number
  reputation: number
  completed_levels: string
  updated_at: string
}

export interface ProgressSnapshot {
  progress: {
    stageIndex: number
    levelIndex: number
    xp: number
    reputation: number
    cash: number
    completedLevels: string[]
    updatedAt: string
  }
  level: LevelDef | null
  mission: Mission | null
  board: ObjectiveProgress[]
}

export interface EvidenceEvent {
  kind: ObjectiveType
  target: string
}

/* ------------------------------------------------------------ reading ----- */

function ensureRow(userId: string): PlayerProgressRow {
  const existing = one<PlayerProgressRow>('SELECT * FROM player_progress WHERE user_id = ?', userId)
  if (existing) return existing

  const now = new Date().toISOString()
  run(
    `INSERT INTO player_progress (user_id, stage_index, level_index, xp, cash, reputation, completed_levels, updated_at)
     VALUES (?, 1, 1, 0, 0, 0, '[]', ?)`,
    userId,
    now,
  )
  return one<PlayerProgressRow>('SELECT * FROM player_progress WHERE user_id = ?', userId)!
}

/** The ids of the levels a player has finished, in completion order. */
export function completedLevelIds(userId: string): string[] {
  return many<{ level_id: string }>(
    'SELECT level_id FROM level_results WHERE user_id = ? ORDER BY completed_at ASC',
    userId,
  ).map((row) => row.level_id)
}

/** XP is the sum of what the rules granted. It is never supplied by a client. */
function derivedXp(userId: string): number {
  return (
    one<{ total: number | null }>('SELECT SUM(xp_awarded) AS total FROM level_results WHERE user_id = ?', userId)
      ?.total ?? 0
  )
}

function derivedReputation(userId: string): number {
  return (
    one<{ total: number | null }>('SELECT SUM(reputation) AS total FROM level_results WHERE user_id = ?', userId)
      ?.total ?? 0
  )
}

/**
 * The numbers `reach_stat` objectives are judged against. Every one of them is
 * derived: cash from the ledger, reputation from the levels actually completed,
 * team size from the members recorded as hired.
 */
function statsFor(userId: string): { cash: number; reputation: number; team: number } {
  const company = getCompanyByOwner(userId)
  const cash = company ? fromKobo(cashBalanceKobo(company.id)) : 0
  const reputation = derivedReputation(userId)
  const team =
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM mission_evidence WHERE user_id = ? AND kind = 'team_member'`,
      userId,
    )?.n ?? 0
  return { cash, reputation, team }
}

/** The live board for a level: what has been done, and what is still open. */
export function boardFor(userId: string, levelId: string): ObjectiveProgress[] {
  const mission = resolvedMission(levelId)
  if (!mission) return []

  const stats = statsFor(userId)
  return mission.objectives.map((objective) => {
    const kind: 'required' | 'optional' = objective.kind === 'optional' ? 'optional' : 'required'

    if (objective.type === 'reach_stat') {
      const value = stats[objective.target as 'cash' | 'reputation' | 'team'] ?? 0
      return { objectiveId: objective.id, progress: value, done: value >= objective.count, kind }
    }

    const matched =
      one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM mission_evidence
         WHERE user_id = ? AND level_id = ? AND kind = ? AND target = ?`,
        userId,
        levelId,
        objective.type,
        objective.target,
      )?.n ?? 0
    const progress = Math.min(objective.count, matched)
    return { objectiveId: objective.id, progress, done: progress >= objective.count, kind }
  })
}

function isBoardComplete(board: ObjectiveProgress[]): boolean {
  const required = board.filter((entry) => entry.kind !== 'optional')
  return required.length > 0 && required.every((entry) => entry.done)
}

/** Business actions that depend on research cannot be completed by API callers
 * until the corresponding evidence exists on the current level. */
function actionPrerequisiteSatisfied(userId: string, levelId: string, actionId: string): boolean {
  const prerequisite: Record<string, { kind: string; target: string; count: number }> = {
    hire_team: { kind: 'collect_info', target: 'candidate_profile', count: 3 },
    build_pitch_deck: { kind: 'collect_info', target: 'competitor_info', count: 2 },
    stock_inventory: { kind: 'collect_info', target: 'supplier_quote', count: 2 },
  }
  const rule = prerequisite[actionId]
  if (!rule) return true
  const matched = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM mission_evidence
     WHERE user_id = ? AND level_id = ? AND kind = ? AND target = ?`,
    userId,
    levelId,
    rule.kind,
    rule.target,
  )?.n ?? 0
  return Number(matched) >= rule.count
}

/** The authoritative picture the player application renders from. */
export function progressionSnapshot(userId: string): ProgressSnapshot {
  const row = ensureRow(userId)
  const level = levelForIndex(row.level_index) ?? LEVELS[LEVELS.length - 1]
  const mission = resolvedMission(level.id) ?? null
  const company = getCompanyByOwner(userId)
  const cash = company ? fromKobo(cashBalanceKobo(company.id)) : 0

  return {
    progress: {
      stageIndex: row.stage_index,
      levelIndex: row.level_index,
      xp: derivedXp(userId),
      reputation: derivedReputation(userId),
      cash,
      completedLevels: completedLevelIds(userId),
      updatedAt: row.updated_at,
    },
    level,
    mission,
    board: boardFor(userId, level.id),
  }
}

/* ------------------------------------------------------------ writing ----- */

/**
 * Records what the player did and re-evaluates the level.
 *
 * Only objectives on the player's *current* level are accepted: a client that
 * claims to have satisfied next week's work is simply ignored. The events are
 * written append-only, each with its own unique key so a retry of the same
 * action cannot be counted twice.
 */
export function recordEvidence(
  userId: string,
  companyId: string | null,
  events: EvidenceEvent[],
  clientKey: string,
): { recorded: number; deduplicated: boolean; snapshot: ProgressSnapshot } {
  return transaction(() => {
    const row = ensureRow(userId)
    const level = levelForIndex(row.level_index)
    const mission = level ? resolvedMission(level.id) : undefined
    const allowed = new Set(
      mission?.objectives.filter((o) => o.type !== 'reach_stat').map((o) => `${o.type}:${o.target}`) ?? [],
    )

    const now = new Date().toISOString()
    let recorded = 0
    let deduplicated = false

    events.forEach((event, index) => {
      // Ignore anything that is not an objective of the level in progress.
      if (!allowed.has(`${event.kind}:${event.target}`)) return
      if (event.kind === 'business_action' && !actionPrerequisiteSatisfied(userId, level!.id, event.target)) return

      const idempotencyKey = `evidence:${userId}:${level!.id}:${clientKey}:${index}`
      const existing = one<{ id: string }>(
        'SELECT id FROM mission_evidence WHERE idempotency_key = ?',
        idempotencyKey,
      )
      if (existing) {
        deduplicated = true
        return
      }

      run(
        `INSERT INTO mission_evidence
           (id, user_id, company_id, level_id, kind, target, actor, rule_version, occurred_at, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        userId,
        companyId,
        level!.id,
        event.kind,
        event.target,
        userId,
        RULE_VERSIONS.progression,
        now,
        idempotencyKey,
        now,
      )
      recorded += 1
    })

    if (recorded > 0) {
      emitEvent({
        companyId,
        type: 'mission.evidence',
        payload: { levelId: level?.id ?? null, events, recorded },
        idempotencyKey: `evidence:${userId}:${clientKey}`,
        occurredAt: now,
      })
    }

    evaluateLevels(userId, companyId)
    refreshMirror(userId)
    return { recorded, deduplicated, snapshot: progressionSnapshot(userId) }
  })
}

/**
 * Resolves every level the recorded evidence now satisfies, in order, and
 * advances the player. Awards are written as `level_results` rows, which is
 * what xp and reputation are summed from — so the same evidence can never
 * award a level twice.
 */
function evaluateLevels(userId: string, companyId: string | null): void {
  for (let guard = 0; guard < LEVELS.length; guard++) {
    const row = ensureRow(userId)
    const level = levelForIndex(row.level_index)
    if (!level) break

    const board = boardFor(userId, level.id)
    if (!isBoardComplete(board)) break

    const already = one<{ id: string }>('SELECT id FROM level_results WHERE user_id = ? AND level_id = ?', userId, level.id)
    if (already) {
      // Completed but the pointer was never advanced (an older save): move on.
      advance(userId, level.index)
      continue
    }

    const now = new Date().toISOString()
    run(
      `INSERT INTO level_results (id, user_id, level_id, xp_awarded, reputation, rule_version, evidence, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      userId,
      level.id,
      level.xpReward,
      level.reputationReward,
      RULE_VERSIONS.progression,
      JSON.stringify(board),
      now,
    )

    emitEvent({
      companyId,
      type: 'level.completed',
      payload: { levelId: level.id, xp: level.xpReward, reputation: level.reputationReward },
      idempotencyKey: `level:${userId}:${level.id}`,
      occurredAt: now,
    })

    advance(userId, level.index)
  }
}

/** Moves the player's pointer to the level after `completedIndex`. */
function advance(userId: string, completedIndex: number): void {
  const nextIndex = Math.min(LEVELS.length, completedIndex + 1)
  const stageIndex = Math.max(1, Math.ceil(nextIndex / LEVELS_PER_STAGE))
  run(
    `UPDATE player_progress
     SET level_index = ?, stage_index = ?, updated_at = ?
     WHERE user_id = ?`,
    nextIndex,
    stageIndex,
    new Date().toISOString(),
    userId,
  )
  refreshMirror(userId)
}

/**
 * Keeps the denormalised columns the lecturer and administrator portals read in
 * step with the derived truth. `player_progress` is a *mirror*: the values are
 * recomputed from `level_results` and the ledger, never accepted from a client.
 */
export function refreshMirror(userId: string): void {
  const company = getCompanyByOwner(userId)
  const cash = company ? fromKobo(cashBalanceKobo(company.id)) : 0
  run(
    `UPDATE player_progress
     SET xp = ?, cash = ?, reputation = ?, completed_levels = ?, updated_at = ?
     WHERE user_id = ?`,
    derivedXp(userId),
    cash,
    derivedReputation(userId),
    JSON.stringify(completedLevelIds(userId)),
    new Date().toISOString(),
    userId,
  )
}
