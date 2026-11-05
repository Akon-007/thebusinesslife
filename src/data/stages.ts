import type { Stage } from '../types/progression'

/**
 * The five major progression stages of BUSINESSLIFE.
 * FROZEN CONTRACT: this ordering is part of the game's identity and must not change.
 */
export const STAGES: Stage[] = [
  {
    id: 'beginner',
    index: 1,
    name: 'Beginner',
    description: 'Turn a raw idea into a registered, trading business in Lagos.',
    levelRange: [1, 15],
  },
  {
    id: 'early_growth',
    index: 2,
    name: 'Early Growth',
    description: 'Find product-market fit and win your first repeat customers.',
    levelRange: [16, 30],
  },
  {
    id: 'expansion',
    index: 3,
    name: 'Expansion',
    description: 'Open new locations, hire at scale and expand across the state.',
    levelRange: [31, 45],
  },
  {
    id: 'established',
    index: 4,
    name: 'Established',
    description: 'Build durable systems, partnerships and a recognised brand.',
    levelRange: [46, 60],
  },
  {
    id: 'unicorn',
    index: 5,
    name: 'Unicorn',
    description: 'Scale into a market-defining company with a billion-dollar valuation.',
    levelRange: [61, 75],
  },
]

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<
  Stage['id'],
  Stage
>
