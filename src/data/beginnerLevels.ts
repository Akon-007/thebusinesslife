import type { LevelDef } from '../types/progression'

/**
 * The Beginner stage's 15 levels.
 *
 * FROZEN CONTRACT: titles, order and unlock conditions below define the game's
 * progression. Missions and requirements are authored in `missions.ts` keyed by
 * these level ids. Do not re-order or remove levels.
 *
 * Cash rewards are zero on purpose. Completing a level earns experience and
 * standing, never money: every naira a company holds has to be explained by a
 * ledger transaction (a sale, a contribution, a loan), so progression must not
 * be able to mint it.
 */
export const BEGINNER_LEVELS: LevelDef[] = [
  {
    id: 'L1',
    index: 1,
    stageId: 'beginner',
    title: 'The Idea',
    summary: 'You have a business idea. Go and test it against someone who has done it before.',
    unlocks: ['phone'],
    requirements: ['Write down your business idea', 'Define the problem you are solving'],
    rewards: { xp: 60, cash: 0, reputation: 1 },
  },
  {
    id: 'L2',
    index: 2,
    stageId: 'beginner',
    title: 'Market Discovery',
    summary: 'Walk the market and find real customers. Listen before you sell.',
    unlocks: ['market'],
    requirements: ['Interview 3 potential customers', 'Identify a target market'],
    rewards: { xp: 80, cash: 0, reputation: 2 },
  },
  {
    id: 'L3',
    index: 3,
    stageId: 'beginner',
    title: 'Business Planning',
    summary: 'Price your product against the market and write a plan you can defend.',
    unlocks: ['business_plan'],
    requirements: ['Compare market prices', 'Write a business plan'],
    rewards: { xp: 100, cash: 0, reputation: 2 },
  },
  {
    id: 'L4',
    index: 4,
    stageId: 'beginner',
    title: 'Company Formation',
    summary: 'Head to the registry. Speak to the officials. Register the company.',
    unlocks: ['company_registration'],
    requirements: ['Visit the registration office', 'Register the business name'],
    rewards: { xp: 120, cash: 0, reputation: 3 },
  },
  {
    id: 'L5',
    index: 5,
    stageId: 'beginner',
    title: 'Meet the Requirements',
    summary: 'Regulators want paperwork. Collect the requirements and satisfy them.',
    unlocks: [],
    requirements: ['Collect 3 regulatory requirements', 'Complete registration'],
    rewards: { xp: 140, cash: 0, reputation: 3 },
  },
  {
    id: 'L6',
    index: 6,
    stageId: 'beginner',
    title: 'Open for Business',
    summary: 'Find a premises in a commercial area and put your name on the door.',
    unlocks: [],
    requirements: ['Secure a trading premises', 'Open the business'],
    rewards: { xp: 160, cash: 0, reputation: 4 },
  },
  {
    id: 'L7',
    index: 7,
    stageId: 'beginner',
    title: 'Build Your Founding Team',
    summary: 'You cannot do this alone. Recruit people who are better than you at something.',
    unlocks: ['hire_team'],
    requirements: ['Review 3 candidates', 'Hire your founding team'],
    rewards: { xp: 180, cash: 0, reputation: 4 },
  },
  {
    id: 'L8',
    index: 8,
    stageId: 'beginner',
    title: 'Find Your First Capital',
    summary: 'The bank wants numbers. Go and learn what they will ask for.',
    unlocks: ['fundraising'],
    requirements: ['Discuss loan terms with a bank', 'Open a business account'],
    rewards: { xp: 200, cash: 0, reputation: 5 },
  },
  {
    id: 'L9',
    index: 9,
    stageId: 'beginner',
    title: 'Prepare to Pitch',
    summary: 'Know your competitors, then build a deck that answers every hard question.',
    unlocks: ['pitch'],
    requirements: ['Research 2 competitors', 'Build your pitch deck'],
    rewards: { xp: 220, cash: 0, reputation: 5 },
  },
  {
    id: 'L10',
    index: 10,
    stageId: 'beginner',
    title: 'Enter the Investment Market',
    summary: 'Investors live in the business district. Make yourself known to them.',
    unlocks: ['investors'],
    requirements: ['Meet 3 investors', 'Gauge investment interest'],
    rewards: { xp: 240, cash: 0, reputation: 6 },
  },
  {
    id: 'L11',
    index: 11,
    stageId: 'beginner',
    title: 'Handle Your First Rejection',
    summary: 'You will be turned down. Learn from it and go again.',
    unlocks: [],
    requirements: ['Pitch twice', 'Review the rejection feedback'],
    rewards: { xp: 260, cash: 0, reputation: 6 },
  },
  {
    id: 'L12',
    index: 12,
    stageId: 'beginner',
    title: 'Secure Pre-seed Investment',
    summary: 'One investor believes you. Close the round.',
    unlocks: [],
    requirements: ['Close a pre-seed round'],
    rewards: { xp: 320, cash: 0, reputation: 10 },
  },
  {
    id: 'L13',
    index: 13,
    stageId: 'beginner',
    title: 'Prepare for Launch',
    summary: 'Get stock, logistics and positioning ready before the doors open.',
    unlocks: [],
    requirements: ['Negotiate 2 supplier quotes', 'Stock your inventory'],
    rewards: { xp: 340, cash: 0, reputation: 8 },
  },
  {
    id: 'L14',
    index: 14,
    stageId: 'beginner',
    title: 'First Board & Business Review',
    summary: 'Your investors want governance. Sit down and answer for the numbers.',
    unlocks: ['board'],
    requirements: ['Hold a board meeting', 'Build reputation'],
    rewards: { xp: 380, cash: 0, reputation: 12 },
  },
  {
    id: 'L15',
    index: 15,
    stageId: 'beginner',
    title: 'Launch & Break-even',
    summary: 'Launch the product and earn back everything you have spent.',
    unlocks: ['launch'],
    requirements: ['Launch the product', 'Break even'],
    rewards: { xp: 600, cash: 0, reputation: 20 },
  },
]

export const LEVEL_BY_ID = Object.fromEntries(BEGINNER_LEVELS.map((l) => [l.id, l])) as Record<
  string,
  LevelDef
>

export const FIRST_LEVEL_ID = BEGINNER_LEVELS[0].id
export const LAST_BEGINNER_LEVEL_ID = BEGINNER_LEVELS[BEGINNER_LEVELS.length - 1].id
