// Represents a person living in the city. Every NPC has a functional role in the
// business simulation, not a decorative one.

export type NPCRole =
  | 'customer'
  | 'business_owner'
  | 'employee'
  | 'supplier'
  | 'investor'
  | 'mentor'
  | 'competitor'
  | 'delivery'
  | 'bank_rep'
  | 'gov_official'
  | 'lawyer_accountant'
  | 'market_trader'
  | 'service_provider'
  | 'resident'

export const ALL_NPC_ROLES: NPCRole[] = [
  'customer',
  'business_owner',
  'employee',
  'supplier',
  'investor',
  'mentor',
  'competitor',
  'delivery',
  'bank_rep',
  'gov_official',
  'lawyer_accountant',
  'market_trader',
  'service_provider',
  'resident',
]

/** Behaviour state machine. An NPC is never a frozen statue. */
export type NPCState =
  | 'idle' // standing at a spot, looking around
  | 'walking' // moving along a waypoint path
  | 'talking' // chatting with another NPC or the player
  | 'entering' // walking into a building
  | 'inside' // temporarily off-street inside a building
  | 'leaving' // walking out of a building

export type PersonalityTrait =
  | 'friendly'
  | 'aggressive'
  | 'shrewd'
  | 'curious'
  | 'reserved'
  | 'generous'
  | 'skeptical'
  | 'ambitious'

export const ALL_PERSONALITIES: PersonalityTrait[] = [
  'friendly',
  'aggressive',
  'shrewd',
  'curious',
  'reserved',
  'generous',
  'skeptical',
  'ambitious',
]

export type NPCAccessory = 'none' | 'cap' | 'bag' | 'glasses' | 'headtie' | 'phone'

/** Purely cosmetic, but distinct so the crowd reads as individuals. */
export interface NPCAppearance {
  skin: string
  shirt: string
  trousers: string
  hair: string
  accessory: NPCAccessory
  heightScale: number
}

/** A live NPC in the world. This is the object the renderer reads and the brain mutates. */
export interface NPCEntity {
  id: string
  name: string
  role: NPCRole
  personality: PersonalityTrait
  /** District this NPC belongs to and wanders within. */
  districtId: string
  /** World position. y is ground height. */
  position: [number, number, number]
  rotationY: number
  state: NPCState
  speed: number

  // --- brain ---
  /** Ordered list of waypoint node ids to walk through. */
  path: string[]
  pathIndex: number
  /** Seconds to remain in the current idle/talk state before picking a new goal. */
  waitTimer: number
  /** NPC id currently being talked to, if any. */
  talkingToId: string | null
  /** Building the NPC belongs to; used for enter/exit behaviour. */
  homeBuildingId: string | null
  /** Buildings the NPC is willing to walk into. */
  visitBuildingIds: string[]
  /** Set while the NPC is inside a building, so the renderer can hide it. */
  insideTimer: number

  // --- interaction ---
  /** How many times the player has performed each interaction on this NPC. */
  interacted: Record<string, number>

  appearance: NPCAppearance
}
