/**
 * The controlled vocabulary of authored content.
 *
 * Both the administrator's authoring routes and the player-facing content feed
 * read from here, so a mission written in the portal is validated against
 * exactly the same set of types the game understands. Nothing in this file
 * describes the *structure* of progression — the stages and the fifteen Beginner
 * levels remain a client-side contract.
 */

/** The eight mission types the simulation supports. */
export const MISSION_TYPES = [
  'main',
  'side',
  'tutorial',
  'challenge',
  'investment',
  'operations',
  'marketing',
  'reflection',
] as const
export type MissionType = (typeof MISSION_TYPES)[number]

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  main: 'Main storyline',
  side: 'Side mission',
  tutorial: 'Guided tutorial',
  challenge: 'Timed challenge',
  investment: 'Investment & funding',
  operations: 'Operations & team',
  marketing: 'Market & customers',
  reflection: 'Review & assessment',
}

/** How an objective is satisfied — mirrors the player app's ObjectiveType. */
export const OBJECTIVE_TYPES = [
  'visit_building',
  'talk_role',
  'do_interaction',
  'collect_info',
  'business_action',
  'reach_stat',
] as const
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number]

export const OBJECTIVE_TYPE_LABELS: Record<ObjectiveType, string> = {
  visit_building: 'Visit a building',
  talk_role: 'Talk to a role',
  do_interaction: 'Perform an interaction',
  collect_info: 'Collect information',
  business_action: 'Perform a business action',
  reach_stat: 'Reach a statistic',
}

/** Feature keys a level can unlock. Kept in step with the client's UnlockKey. */
export const UNLOCK_KEYS = [
  'phone',
  'market',
  'business_plan',
  'company_registration',
  'hire_team',
  'fundraising',
  'pitch',
  'investors',
  'launch',
  'board',
] as const
export type UnlockKey = (typeof UNLOCK_KEYS)[number]

export const MISSION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type MissionStatus = (typeof MISSION_STATUSES)[number]

export const OBJECTIVE_KINDS = ['required', 'optional'] as const
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number]

/**
 * The level ids a mission may be attached to. This mirrors the frozen Beginner
 * catalogue; the server validates against it so a mission can never point at a
 * level that does not exist.
 */
export const LEVEL_IDS = [
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
  'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15',
] as const
export type LevelId = (typeof LEVEL_IDS)[number]

/** Everything the Mission Builder needs to render its pickers. */
export function contentVocabulary() {
  return {
    missionTypes: MISSION_TYPES.map((value) => ({ value, label: MISSION_TYPE_LABELS[value] })),
    objectiveTypes: OBJECTIVE_TYPES.map((value) => ({ value, label: OBJECTIVE_TYPE_LABELS[value] })),
    unlockKeys: UNLOCK_KEYS.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
    missionStatuses: [...MISSION_STATUSES],
    objectiveKinds: [...OBJECTIVE_KINDS],
    levels: [...LEVEL_IDS],
  }
}

/* ------------------------------------------------------------------ rows -- */

export interface MissionRow {
  id: string
  level_id: string
  title: string
  description: string
  instructions: string
  type: string
  xp_reward: number
  status: string
  prerequisites: string
  npc_requirements: string
  location_requirements: string
  completion_conditions: string
  evaluation_criteria: string
  failure_conditions: string
  recovery_instructions: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface ObjectiveRow {
  id: string
  mission_id: string
  ordinal: number
  kind: string
  type: string
  target: string
  text: string
  count: number
  hint: string | null
  hint_location: string | null
}

/** JSON array columns are parsed defensively: bad data degrades to an empty list. */
export function parseList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

export function toObjective(row: ObjectiveRow) {
  return {
    id: row.id,
    kind: row.kind === 'optional' ? 'optional' : 'required',
    type: row.type,
    target: row.target,
    text: row.text,
    count: Number(row.count),
    hint: row.hint,
    hintLocation: row.hint_location,
  }
}

export function toMission(row: MissionRow, objectives: ObjectiveRow[]) {
  return {
    id: row.id,
    levelId: row.level_id,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    type: row.type,
    xpReward: Number(row.xp_reward),
    status: row.status,
    prerequisites: parseList(row.prerequisites),
    npcRequirements: parseList(row.npc_requirements),
    locationRequirements: parseList(row.location_requirements),
    completionConditions: parseList(row.completion_conditions),
    evaluationCriteria: parseList(row.evaluation_criteria),
    failureConditions: parseList(row.failure_conditions),
    recoveryInstructions: row.recovery_instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    objectives: objectives.map(toObjective),
  }
}
