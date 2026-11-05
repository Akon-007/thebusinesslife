import type { NPCRole } from './npc'

/** The kinds of information the player can extract from the city. */
export type InfoKind =
  | 'customer_need'
  | 'price_quote'
  | 'competitor_info'
  | 'supplier_quote'
  | 'requirement_info'
  | 'market_price'
  | 'funding_terms'
  | 'investment_interest'
  | 'mentorship_advice'
  | 'industry_experience'
  | 'opportunity'
  | 'candidate_profile'

/**
 * A record collected from an NPC interaction. Survives across missions and is
 * reused by later objectives and by the business plan.
 */
export interface CollectedInfo {
  id: string
  kind: InfoKind
  label: string
  detail: string
  sourceNpcId: string
  sourceNpcName: string
  sourceRole: NPCRole
  /** Optional numeric payload, e.g. a quoted price or a budget. */
  value?: number
  collectedAt: number
}

export type BusinessRecordKey =
  | 'idea'
  | 'problem'
  | 'targetMarket'
  | 'valueProposition'
  | 'businessPlan'
  | 'companyName'
  | 'registrationNumber'
  | 'productName'
  | 'pitchDeck'
  | 'fundingAsk'

/** Free-form business record entries the player fills in as they progress. */
export type BusinessRecords = Record<string, string>

export interface TeamMember {
  npcId: string
  name: string
  role: string
  skill: number
  salary: number
}
