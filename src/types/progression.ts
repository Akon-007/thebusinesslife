export type StageId = 'beginner' | 'early_growth' | 'expansion' | 'established' | 'unicorn'

export interface Stage {
  id: StageId
  index: number
  name: string
  description: string
  /** Inclusive level range within the stage, 1-indexed. */
  levelRange: [number, number]
}

export interface Rewards {
  xp: number
  cash: number
  reputation: number
}

/**
 * A level in the progression. The Beginner stage's 15 levels are the frozen
 * design contract for this game and must never be re-ordered or replaced.
 */
export interface LevelDef {
  id: string // 'L1' .. 'L15'
  index: number // 1..15
  stageId: StageId
  title: string
  summary: string
  /** Feature keys unlocked when this level is completed. */
  unlocks: string[]
  /** Human-readable business-record requirements, kept for the business log. */
  requirements: string[]
  rewards: Rewards
}

/** Feature keys that levels can unlock. Gates gameplay, not just cosmetics. */
export type UnlockKey =
  | 'phone'
  | 'market'
  | 'business_plan'
  | 'company_registration'
  | 'hire_team'
  | 'fundraising'
  | 'pitch'
  | 'investors'
  | 'launch'
  | 'board'
