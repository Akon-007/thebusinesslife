import type { BusinessRecordKey, InfoKind } from '../../types/business'
import type { UnlockKey } from '../../types/progression'

export interface BusinessActionDef {
  id: string
  label: string
  description: string
  category: 'planning' | 'legal' | 'operations' | 'finance' | 'growth'
  /** Up-front cash cost. */
  cost?: number
  /** Feature that must be unlocked first. */
  requiresUnlock?: UnlockKey
  /** Earliest level this can appear at. */
  minLevel?: number
  /** Only offered after this action has been performed. */
  afterAction?: string
  /** Some actions need a condition other than level/unlock. */
  requires?: 'has_pitched'
  xp: number
  reputation?: number
  /** Writes an entry into the business log. */
  record?: { key: BusinessRecordKey; value: string }
}

/**
 * The business actions the player performs through the Business panel.
 * A handful are also triggered directly from NPC interactions (registering a
 * company, opening a bank account, leasing premises), which is why they live
 * here as data rather than inline in a component.
 */
export const BUSINESS_ACTIONS: BusinessActionDef[] = [
  {
    id: 'write_business_idea',
    label: 'Write down your business idea',
    description: 'Capture the idea clearly enough that another person can understand it.',
    category: 'planning',
    minLevel: 1,
    xp: 20,
    record: {
      key: 'idea',
      value: 'Founder brief: a clear business idea grounded in a real Lagos customer problem.',
    },
  },
  {
    id: 'define_problem',
    label: 'Define the problem you solve',
    description: 'Turn the idea into a specific customer problem you can test.',
    category: 'planning',
    minLevel: 1,
    afterAction: 'write_business_idea',
    xp: 20,
    record: {
      key: 'problem',
      value: 'Problem statement: customers need a simpler, more reliable way to solve the job.',
    },
  },
  {
    id: 'define_target_market',
    label: 'Define your target market',
    description: 'Choose the first customer group you will serve, based on your interviews.',
    category: 'planning',
    minLevel: 2,
    afterAction: 'write_business_idea',
    xp: 25,
    record: {
      key: 'targetMarket',
      value: 'Initial target market selected from customer interviews in Balogun Market.',
    },
  },
  {
    id: 'compare_market_prices',
    label: 'Compare market prices',
    description: 'Use your market research to set a defensible starting price.',
    category: 'planning',
    minLevel: 3,
    xp: 25,
    record: {
      key: 'valueProposition',
      value: 'Pricing benchmark recorded with a clear value proposition.',
    },
  },
  {
    id: 'write_business_plan',
    label: 'Write your business plan',
    description: 'Turn your research into a written plan you can defend.',
    category: 'planning',
    requiresUnlock: 'business_plan',
    xp: 40,
    record: {
      key: 'businessPlan',
      value: 'Market-validated plan covering pricing, supply and unit economics.',
    },
  },
  {
    id: 'register_company',
    label: 'Register your company',
    description: 'File incorporation with the Corporate Affairs registry.',
    category: 'legal',
    cost: 25000,
    requiresUnlock: 'company_registration',
    xp: 40,
    record: { key: 'companyName', value: 'Incorporated at the Corporate Affairs registry.' },
  },
  {
    id: 'complete_registration',
    label: 'Complete your registration',
    description: 'Satisfy every outstanding regulatory condition.',
    category: 'legal',
    minLevel: 5,
    afterAction: 'register_company',
    xp: 40,
    record: { key: 'registrationNumber', value: 'RC-1183920' },
  },
  {
    id: 'lease_premises',
    label: 'Secure trading premises',
    description: 'Lease a shop front in a commercial area.',
    category: 'operations',
    cost: 40000,
    minLevel: 6,
    xp: 30,
  },
  {
    id: 'open_business',
    label: 'Open the business',
    description: 'Put your name on the door and start trading.',
    category: 'operations',
    minLevel: 6,
    afterAction: 'lease_premises',
    xp: 60,
    reputation: 2,
  },
  {
    id: 'hire_team',
    label: 'Hire your founding team',
    description: 'Bring on the people you have reviewed and vetted.',
    category: 'operations',
    requiresUnlock: 'hire_team',
    cost: 15000,
    xp: 50,
  },
  {
    id: 'open_bank_account',
    label: 'Open a business account',
    description: 'Separate the company money from your own.',
    category: 'finance',
    xp: 30,
  },
  {
    id: 'arrange_delivery',
    label: 'Arrange a delivery contract',
    description: 'Put a rider on your shop every morning.',
    category: 'operations',
    cost: 60000,
    minLevel: 6,
    xp: 20,
  },
  {
    id: 'book_service',
    label: 'Book business services',
    description: 'Signage, branding and generator servicing for the premises.',
    category: 'operations',
    cost: 85000,
    minLevel: 6,
    xp: 18,
  },
  {
    id: 'build_pitch_deck',
    label: 'Build your pitch deck',
    description: 'Assemble the story and the numbers into a deck.',
    category: 'finance',
    requiresUnlock: 'pitch',
    xp: 45,
    record: { key: 'pitchDeck', value: '10-slide deck: problem, market, traction, unit economics, ask.' },
  },
  {
    id: 'review_rejection',
    label: 'Review the rejection feedback',
    description: 'Read what the investors actually told you.',
    category: 'finance',
    minLevel: 11,
    requires: 'has_pitched',
    xp: 40,
  },
  {
    id: 'secure_preseed',
    label: 'Close your pre-seed round',
    description: 'Sign the terms and take the money into the business.',
    category: 'finance',
    minLevel: 12,
    requires: 'has_pitched',
    xp: 80,
    reputation: 10,
    record: { key: 'fundingAsk', value: 'Pre-seed round closed and funded.' },
  },
  {
    id: 'stock_inventory',
    label: 'Stock your inventory',
    description: 'Fill the shelves before launch day.',
    category: 'operations',
    cost: 60000,
    minLevel: 13,
    xp: 40,
  },
  {
    id: 'hold_board_meeting',
    label: 'Hold your first board meeting',
    description: 'Present the numbers to your investors.',
    category: 'growth',
    requiresUnlock: 'board',
    xp: 60,
    reputation: 4,
  },
  {
    id: 'launch_product',
    label: 'Launch the product',
    description: 'Fund the launch campaign and open to the public.',
    category: 'growth',
    cost: 1000000,
    requiresUnlock: 'launch',
    xp: 100,
    reputation: 8,
    record: { key: 'productName', value: 'Launched to the public market.' },
  },
]

export const BUSINESS_ACTION_BY_ID = Object.fromEntries(
  BUSINESS_ACTIONS.map((a) => [a.id, a]),
) as Record<string, BusinessActionDef>

export interface ActionAvailabilityContext {
  levelIndex: number
  unlocks: string[]
  performed: string[]
  performedInteractions: string[]
  cash: number
  /** Number of regulatory requirement records collected from the registry. */
  requirementInfoCount?: number
  researchCounts?: Partial<Record<InfoKind, number>>
}

export type ActionAvailability =
  | { available: true; def: BusinessActionDef }
  | { available: false; def: BusinessActionDef; reason: string }

/**
 * Decides whether a business action can be taken right now, and if not, why.
 * The reason string is shown directly in the UI, so it has to read well.
 */
export function evaluateAction(
  def: BusinessActionDef,
  ctx: ActionAvailabilityContext,
): ActionAvailability {
  if (ctx.performed.includes(def.id)) {
    return { available: false, def, reason: 'Already completed' }
  }
  if (def.requiresUnlock && !ctx.unlocks.includes(def.requiresUnlock)) {
    return { available: false, def, reason: 'Locked — keep progressing to unlock' }
  }
  if (def.minLevel && ctx.levelIndex < def.minLevel) {
    return { available: false, def, reason: `Available from level ${def.minLevel}` }
  }
  if (def.afterAction && !ctx.performed.includes(def.afterAction)) {
    const prereq = BUSINESS_ACTION_BY_ID[def.afterAction]
    return { available: false, def, reason: `Requires: ${prereq?.label ?? def.afterAction}` }
  }
  if (def.id === 'complete_registration' && (ctx.requirementInfoCount ?? 0) < 3) {
    return {
      available: false,
      def,
      reason: `Collect ${3 - (ctx.requirementInfoCount ?? 0)} more regulatory requirement${3 - (ctx.requirementInfoCount ?? 0) === 1 ? '' : 's'}`,
    }
  }
  const researchGate: Partial<Record<string, { kind: InfoKind; count: number; label: string }>> = {
    hire_team: { kind: 'candidate_profile', count: 3, label: 'candidate profiles' },
    build_pitch_deck: { kind: 'competitor_info', count: 2, label: 'competitor studies' },
    stock_inventory: { kind: 'supplier_quote', count: 2, label: 'supplier quotes' },
  }
  const gate = researchGate[def.id]
  if (gate && (ctx.researchCounts?.[gate.kind] ?? 0) < gate.count) {
    const remaining = gate.count - (ctx.researchCounts?.[gate.kind] ?? 0)
    return {
      available: false,
      def,
      reason: `Collect ${remaining} more ${gate.label.replace(/s$/, remaining === 1 ? '' : 's')}`,
    }
  }
  if (def.requires === 'has_pitched' && !ctx.performedInteractions.includes('pitch')) {
    return { available: false, def, reason: 'Pitch to an investor first' }
  }
  if (def.cost && ctx.cash < def.cost) {
    return { available: false, def, reason: `Not enough cash (needs ₦${def.cost.toLocaleString()})` }
  }
  return { available: true, def }
}

export function availableActions(ctx: ActionAvailabilityContext): BusinessActionDef[] {
  return BUSINESS_ACTIONS.filter((def) => evaluateAction(def, ctx).available)
}
