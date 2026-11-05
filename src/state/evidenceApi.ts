import { api } from '../api/client'

/**
 * Player progression, as the server decides it.
 *
 * The client never sends a level, an xp figure or a cash balance. It sends what
 * happened — "I visited the market", "I spoke to an investor" — and the server
 * checks that against the mission catalogue before it awards anything. This
 * module is the thin transport for that exchange; the store applies the answer.
 */

export type EvidenceKind =
  | 'visit_building'
  | 'talk_role'
  | 'do_interaction'
  | 'collect_info'
  | 'business_action'
  | 'team_member'

export interface EvidenceEvent {
  kind: EvidenceKind
  target: string
}

export interface ProgressBoardEntry {
  objectiveId: string
  progress: number
  done: boolean
  kind: 'required' | 'optional'
}

export interface ServerProgressSnapshot {
  progress: {
    stageIndex: number
    levelIndex: number
    xp: number
    reputation: number
    cash: number
    completedLevels: string[]
    updatedAt: string
  }
  board: ProgressBoardEntry[]
}

export interface EvidenceResult {
  recorded: number
  deduplicated: boolean
  snapshot: ServerProgressSnapshot
}

/** The authoritative progress picture for the signed-in player. */
export function fetchProgress(): Promise<ServerProgressSnapshot> {
  return api<ServerProgressSnapshot>('/player/progress')
}

/**
 * Records objective evidence and returns the server's verdict.
 *
 * `idempotencyKey` must be derived from the action itself so a retry of the
 * same action is recognised as one occurrence rather than two.
 */
export function submitProgressEvidence(events: EvidenceEvent[], idempotencyKey: string): Promise<EvidenceResult> {
  return api<EvidenceResult>('/player/progress/evidence', {
    method: 'POST',
    body: { events, idempotencyKey },
  })
}
