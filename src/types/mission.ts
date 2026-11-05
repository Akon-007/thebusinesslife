import type { NPCRole } from './npc'

/** The kind of thing an objective watches for. */
export type ObjectiveType =
  | 'visit_building' // walk to a building of a given type
  | 'talk_role' // interact with N NPCs of a role
  | 'do_interaction' // perform a specific interaction on any eligible NPC
  | 'collect_info' // gather N info records of a kind from NPC interactions
  | 'business_action' // perform a named business action (e.g. register_company)
  | 'reach_stat' // reach a cash / reputation / team threshold

export interface Objective {
  id: string
  /** Player-facing objective text. */
  text: string
  type: ObjectiveType
  /**
   * Meaning depends on `type`:
   *  - visit_building  -> BuildingType
   *  - talk_role       -> NPCRole
   *  - do_interaction  -> interaction id
   *  - collect_info    -> InfoKind
   *  - business_action -> action id
   *  - reach_stat      -> 'cash' | 'reputation' | 'team'
   */
  target: string
  /** How many times the objective must be satisfied. */
  count: number
  /**
   * Optional objectives are shown to the player but never block completion.
   * Absent means required, so the frozen catalogue is unaffected.
   */
  kind?: 'required' | 'optional'
  /** Where the player should go. Shown on the minimap as a waypoint. */
  hintLocation?: string
  hint?: string
}

export interface Mission {
  levelId: string
  title: string
  /** Story briefing shown when the level starts. */
  briefing: string
  objectives: Objective[]
}

/** A single tracked objective with live progress. */
export interface ObjectiveProgress {
  objectiveId: string
  progress: number
  done: boolean
  /**
   * Copied from the objective at the start of a level so completion can be
   * judged without re-reading the mission. Saves written before optional
   * objectives existed omit it, and are read as required.
   */
  kind?: 'required' | 'optional'
}
