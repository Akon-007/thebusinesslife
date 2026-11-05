import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BusinessRecords, CollectedInfo, TeamMember } from '../types/business'
import type { NPCRole } from '../types/npc'
import type { BuildingType } from '../types/world'
import type { MissionEvent } from '../systems/mission/missionEngine'
import {
  applyMissionEvent,
  initProgress,
  isMissionComplete,
  syncStatObjectives,
} from '../systems/mission/missionEngine'
import type { ObjectiveProgress } from '../types/mission'
import {
  currentLevelDef,
  missionForLevel,
  unlockedFeatures,
} from '../systems/progression/progressionEngine'
import { BUSINESS_ACTION_BY_ID, evaluateAction } from '../systems/business/businessActions'
import { BEGINNER_LEVELS } from '../data/beginnerLevels'
import {
  submitProgressEvidence,
  type EvidenceEvent,
  type ServerProgressSnapshot,
} from './evidenceApi'
import { company as companyApi } from '../api/company'

export interface GameNotification {
  id: string
  kind: 'mission' | 'info' | 'level' | 'cash' | 'warning'
  title: string
  body?: string
  at: number
}

export interface NpcInteractionInput {
  npcId: string
  npcRole: NPCRole
  interactionId: string
  /** Information harvested, without an id (the store assigns one). */
  info?: Omit<CollectedInfo, 'id'>
  /** Business action triggered by the interaction, if any. */
  action?: string
  xp: number
  /** Cash granted by the interaction (e.g. a sale). */
  cashDelta: number
  /** Cash cost of the interaction (e.g. a registration fee). */
  cost?: number
  reputationDelta: number
}

/**
 * A player begins with no money at all.
 *
 * Cash is owned by the server: it is the sum of the company's ledger, and the
 * client only ever displays what the server reports (see `financeStore`). This
 * constant exists so the initial render shows ₦0 rather than inventing a
 * balance the ledger cannot explain.
 */
const START_CASH = 0
const MAX_NOTIFICATIONS = 12

const FOUNDING_TEAM: Omit<TeamMember, 'npcId'>[] = [
  { name: 'Blessing', role: 'Head of Sales', skill: 72, salary: 90000 },
  { name: 'Ibrahim', role: 'Operations Lead', skill: 68, salary: 85000 },
  { name: 'Chinelo', role: 'Finance Officer', skill: 75, salary: 95000 },
]

export interface GameState {
  // --- player ---
  playerName: string
  avatarId: string
  businessName: string
  /** 1-indexed current level within the Beginner stage. */
  levelIndex: number
  xp: number
  cash: number
  reputation: number
  completedLevels: string[]
  completedMissions: string[]

  // --- business ---
  records: BusinessRecords
  team: TeamMember[]
  performedActions: string[]
  performedInteractions: string[]
  stockUnits: number

  // --- mission ---
  progress: ObjectiveProgress[]

  // --- collected world knowledge ---
  collectedInfo: CollectedInfo[]

  // --- npc interaction history, keyed by npc id ---
  npcInteractions: Record<string, Record<string, number>>

  // --- ui feed ---
  notifications: GameNotification[]

  // --- internal counters ---
  infoCounter: number

  // --- actions ---
  /** The single entry point for anything an NPC interaction changes. */
  applyNpcInteraction: (input: NpcInteractionInput) => { ok: boolean; message: string }
  performBusinessAction: (actionId: string) => Promise<{ ok: boolean; message: string }>
  /** Records that the player physically walked up to a location. */
  reportBuildingVisit: (buildingType: BuildingType, buildingName: string) => void
  /**
   * Overwrites the wallet, used when the server tells us what the company's
   * cash actually is. Play never invents cash; it spends and earns through the
   * ledger, and this is how the resulting balance comes back.
   */
  setCash: (cash: number) => void
  /**
   * Adopts the server's authoritative progression.
   *
   * Everything the server derives — xp, reputation, the current level, the
   * levels finished and the objective board — replaces the local cache. The
   * client's own mission engine keeps running for instant feedback, but it is
   * only ever a preview of what the server has already decided.
   */
  adoptServerProgress: (snapshot: ServerProgressSnapshot) => void
  pushNotification: (n: Omit<GameNotification, 'id' | 'at'>) => void
  dismissNotification: (id: string) => void
  resetGame: () => void
}

type ProgressFields = Pick<
  GameState,
  'progress' | 'levelIndex' | 'completedLevels' | 'completedMissions' | 'xp' | 'cash' | 'reputation' | 'notifications'
>

/**
 * Applies progress, then repeatedly resolves level completion (and any stat
 * objectives the new rewards immediately satisfy) until the state settles.
 *
 * This is the only place a level can advance. Everything else hands it events.
 */
function settleProgression(
  state: GameState,
  progress: ObjectiveProgress[],
  overrides: Partial<Pick<GameState, 'xp' | 'cash' | 'reputation' | 'team'>> = {},
): ProgressFields {
  let levelIndex = state.levelIndex
  let completedLevels = [...state.completedLevels]
  let completedMissions = [...state.completedMissions]
  let xp = overrides.xp ?? state.xp
  let cash = overrides.cash ?? state.cash
  let reputation = overrides.reputation ?? state.reputation
  const team = overrides.team ?? state.team
  let current = progress
  const notifications = [...state.notifications]

  for (let guard = 0; guard < 4; guard++) {
    const mission = missionForLevel(levelIndex)
    if (!mission) break

    // Keep `reach_stat` objectives honest against the current numbers.
    const synced = syncStatObjectives(mission, current, {
      cash,
      reputation,
      team: team.length,
    })
    current = synced.progress

    if (!isMissionComplete(current)) break

    const level = currentLevelDef(levelIndex)
    if (completedLevels.includes(level.id)) break

    completedLevels = [...completedLevels, level.id]
    completedMissions = [...completedMissions, level.id]
    xp += level.rewards.xp
    reputation += level.rewards.reputation

    notifications.unshift({
      id: `lvl_${level.id}`,
      kind: 'level',
      title: `Level ${level.index} complete — ${level.title}`,
      body: `+${level.rewards.xp} XP · +${level.rewards.reputation} reputation`,
      at: Date.now(),
    })

    const nextIndex = levelIndex + 1
    const nextMission = missionForLevel(nextIndex)
    if (!nextMission) {
      notifications.unshift({
        id: 'stage_done',
        kind: 'level',
        title: 'Beginner stage complete',
        body: 'You have finished all 15 Beginner levels. Early Growth awaits.',
        at: Date.now(),
      })
      levelIndex = nextIndex
      current = []
      break
    }

    levelIndex = nextIndex
    current = initProgress(nextMission)
    const newLevelDef = currentLevelDef(levelIndex)
    notifications.unshift({
      id: `new_${newLevelDef.id}`,
      kind: 'mission',
      title: `New mission: ${newLevelDef.title}`,
      body: nextMission.briefing,
      at: Date.now(),
    })
  }

  return {
    progress: current,
    levelIndex,
    completedLevels,
    completedMissions,
    xp,
    cash,
    reputation,
    notifications: notifications.slice(0, MAX_NOTIFICATIONS),
  }
}

/** Applies a list of events one after another, settling after each. */
function applyEvents(
  state: GameState,
  events: MissionEvent[],
  overrides: Partial<Pick<GameState, 'xp' | 'cash' | 'reputation' | 'team'>>,
): ProgressFields {
  let working: GameState = { ...state, ...overrides }
  for (const event of events) {
    const mission = missionForLevel(working.levelIndex)
    if (!mission) break
    const result = applyMissionEvent(mission, working.progress, event)
    const settled = settleProgression(working, result.changed ? result.progress : working.progress)
    working = { ...working, ...settled }
  }
  return {
    progress: working.progress,
    levelIndex: working.levelIndex,
    completedLevels: working.completedLevels,
    completedMissions: working.completedMissions,
    xp: working.xp,
    cash: working.cash,
    reputation: working.reputation,
    notifications: working.notifications,
  }
}

/** Converts what happened in the world into objective evidence for the server. */
function toEvidence(events: MissionEvent[]): EvidenceEvent[] {
  const evidence: EvidenceEvent[] = []
  for (const event of events) {
    switch (event.type) {
      case 'visit_building':
        evidence.push({ kind: 'visit_building', target: event.buildingType })
        break
      case 'talk_role':
        evidence.push({ kind: 'talk_role', target: event.role })
        break
      case 'do_interaction':
        evidence.push({ kind: 'do_interaction', target: event.interactionId })
        break
      case 'collect_info':
        evidence.push({ kind: 'collect_info', target: event.kind })
        break
      case 'business_action':
        evidence.push({ kind: 'business_action', target: event.actionId })
        break
      case 'reach_stat':
        // Thresholds are judged by the server against real records, never
        // asserted by the player.
        break
    }
  }
  return evidence
}

/**
 * Tells the server what the player just did, then adopts its verdict.
 *
 * `idempotencyKey` is derived from the action itself (who, what, and how many
 * times it has happened) so retrying a failed request records one occurrence,
 * not two. Until the server answers, the local mission engine's optimistic
 * board stands — but only for display.
 */
function recordEvidence(events: MissionEvent[], idempotencyKey: string, extra: EvidenceEvent[] = []): void {
  const evidence = [...toEvidence(events), ...extra]
  if (evidence.length === 0) return

  void submitProgressEvidence(evidence, idempotencyKey)
    .then((result) => useGameStore.getState().adoptServerProgress(result.snapshot))
    .catch(() => {
      /* unreachable server: the local cache stands, and the action can be retried */
    })
}

function initialState() {
  return {
    playerName: 'You',
    avatarId: 'founder-1',
    businessName: 'BusinessLife Ltd',
    levelIndex: 1,
    xp: 0,
    cash: START_CASH,
    reputation: 0,
    completedLevels: [] as string[],
    completedMissions: [] as string[],
    records: {} as BusinessRecords,
    team: [] as TeamMember[],
    performedActions: [] as string[],
    performedInteractions: [] as string[],
    stockUnits: 0,
    progress: initProgress(missionForLevel(1)!),
    collectedInfo: [] as CollectedInfo[],
    npcInteractions: {} as Record<string, Record<string, number>>,
    notifications: [
      {
        id: 'welcome',
        kind: 'mission' as const,
        title: `Welcome to the city — ${BEGINNER_LEVELS[0].title}`,
        body: BEGINNER_LEVELS[0].summary,
        at: Date.now(),
      },
    ],
    infoCounter: 0,
  }
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      applyNpcInteraction: (input) => {
        const state = get()
        if (input.cost && state.cash < input.cost) {
          return { ok: false, message: 'Not enough cash for this' }
        }

        const forNpc = state.npcInteractions[input.npcId] ?? {}
        const occurrence = (forNpc[input.interactionId] ?? 0) + 1
        const updatedForNpc = { ...forNpc, [input.interactionId]: occurrence }

        const hiredTeam =
          input.action === 'hire_team' && state.team.length === 0
            ? FOUNDING_TEAM.map((m, i) => ({ npcId: `hired_${i}`, ...m }))
            : []
        const team = hiredTeam.length > 0 ? hiredTeam : state.team

        const records =
          input.action && BUSINESS_ACTION_BY_ID[input.action]?.record
            ? {
                ...state.records,
                [BUSINESS_ACTION_BY_ID[input.action].record!.key]:
                  BUSINESS_ACTION_BY_ID[input.action].record!.value,
              }
            : state.records

        let collectedInfo = state.collectedInfo
        let infoCounter = state.infoCounter
        if (input.info) {
          infoCounter += 1
          collectedInfo = [
            { ...input.info, id: `info_${infoCounter}` },
            ...state.collectedInfo,
          ].slice(0, 200)
        }

        // One interaction can advance several objectives at once: it is a
        // conversation with a role, an instance of an interaction, a source of
        // information, and possibly a business action.
        const events: MissionEvent[] = [
          { type: 'talk_role', role: input.npcRole },
          { type: 'do_interaction', interactionId: input.interactionId },
        ]
        if (input.info) events.push({ type: 'collect_info', kind: input.info.kind })
        if (input.action) events.push({ type: 'business_action', actionId: input.action })

        // Cash is deliberately absent: the interaction's money effect is posted
        // by the server ledger, and the wallet is refreshed from the books.
        const overrides = {
          xp: state.xp + input.xp,
          reputation: state.reputation + input.reputationDelta,
          team,
        }

        const settled = applyEvents(state, events, overrides)

        set({
          ...settled,
          xp: settled.xp,
          reputation: settled.reputation,
          team,
          records,
          collectedInfo,
          infoCounter,
          npcInteractions: { ...state.npcInteractions, [input.npcId]: updatedForNpc },
          performedInteractions: state.performedInteractions.includes(input.interactionId)
            ? state.performedInteractions
            : [...state.performedInteractions, input.interactionId],
          performedActions:
            input.action && !state.performedActions.includes(input.action)
              ? [...state.performedActions, input.action]
              : state.performedActions,
        })

        // Recorded with the server, which decides what it earned.
        const extra: EvidenceEvent[] = hiredTeam.map((member) => ({
          kind: 'team_member',
          target: member.npcId,
        }))
        recordEvidence(events, `npc:${input.npcId}:${input.interactionId}:${occurrence}`, extra)

        return { ok: true, message: 'Done' }
      },

      performBusinessAction: async (actionId) => {
        const state = get()
        const def = BUSINESS_ACTION_BY_ID[actionId]
        if (!def) return { ok: false, message: 'Unknown action' }

        const availability = evaluateAction(def, {
          levelIndex: state.levelIndex,
          unlocks: unlockedFeatures(state.completedLevels, state.levelIndex),
          performed: state.performedActions,
          performedInteractions: state.performedInteractions,
          cash: state.cash,
        })
        if (!availability.available) return { ok: false, message: availability.reason }

        // Company formation and premises actions are real server mutations.
        // Wait for the backend to accept them before recording the local action
        // or submitting mission evidence; otherwise a failed ledger mutation
        // could still advance the player's local progression.
        let serverCash: number | undefined
        try {
          if (actionId === 'register_company') {
            const result = await companyApi.register()
            serverCash = result.cash
          } else if (actionId === 'complete_registration') {
            await companyApi.completeRegistration()
          } else if (actionId === 'lease_premises') {
            const result = await companyApi.leasePremises()
            serverCash = result.cash
          } else if (actionId === 'open_business') {
            const result = await companyApi.openBusiness()
            serverCash = result.cash
          } else if (actionId === 'open_bank_account') {
            const result = await companyApi.openBankAccount()
            serverCash = result.cash
          }
        } catch (error: unknown) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'The company service could not complete that action.',
          }
        }

        const hiredTeam =
          actionId === 'hire_team' && state.team.length === 0
            ? FOUNDING_TEAM.map((m, i) => ({ npcId: `hired_${i}`, ...m }))
            : []
        const team = hiredTeam.length > 0 ? hiredTeam : state.team

        const overrides = {
          xp: state.xp + def.xp,
          reputation: state.reputation + (def.reputation ?? 0),
          cash: serverCash ?? state.cash,
          team,
        }

        const base: GameState = {
          ...state,
          ...overrides,
          records: def.record
            ? { ...state.records, [def.record.key]: def.record.value }
            : state.records,
          stockUnits: actionId === 'stock_inventory' ? state.stockUnits + 50 : state.stockUnits,
          performedActions: [...state.performedActions, actionId],
        }

        const settled = applyEvents(base, [{ type: 'business_action', actionId }], overrides)

        set({
          ...settled,
          xp: settled.xp,
          reputation: settled.reputation,
          team,
          records: base.records,
          stockUnits: base.stockUnits,
          performedActions: base.performedActions,
        })

        if (actionId === 'register_company' || actionId === 'complete_registration' || actionId === 'lease_premises' || actionId === 'open_business' || actionId === 'open_bank_account') {
          const title = actionId === 'register_company'
            ? 'Company registered'
            : actionId === 'complete_registration'
              ? 'Registration complete'
              : actionId === 'lease_premises'
                ? 'Premises secured'
                : actionId === 'open_business'
                  ? 'Business is open'
                  : 'Business bank account opened'
          useGameStore.getState().pushNotification({
            kind: actionId === 'complete_registration' ? 'level' : 'cash',
            title,
            body: 'The backend company service accepted the action and updated the company records.',
          })
        }

        const extra: EvidenceEvent[] = hiredTeam.map((member) => ({
          kind: 'team_member',
          target: member.npcId,
        }))
        recordEvidence([{ type: 'business_action', actionId }], `action:${actionId}`, extra)

        return { ok: true, message: def.label }
      },

      reportBuildingVisit: (buildingType, buildingName) => {
        const state = get()
        const mission = missionForLevel(state.levelIndex)
        if (!mission) return

        // Only touch the store when the current mission actually waits on this
        // location; otherwise every step near a building would re-render the HUD.
        const relevant = mission.objectives.some((o) => {
          if (o.type !== 'visit_building' || o.target !== buildingType) return false
          const p = state.progress.find((x) => x.objectiveId === o.id)
          return !!p && !p.done
        })
        if (!relevant) return

        const settled = applyEvents(state, [{ type: 'visit_building', buildingType }], {})
        set({ ...settled })
        recordEvidence([{ type: 'visit_building', buildingType }], `visit:${buildingType}`)
        void buildingName
      },

      setCash: (cash) => set({ cash }),

      adoptServerProgress: (snapshot) => {
        const server = snapshot.progress
        if (!server) return
        set({
          levelIndex: server.levelIndex,
          xp: server.xp,
          reputation: server.reputation,
          completedLevels: server.completedLevels,
          completedMissions: server.completedLevels,
          progress: snapshot.board,
        })
      },

      pushNotification: (n) => {
        const state = get()
        const full: GameNotification = { ...n, id: `n_${Date.now()}_${Math.random()}`, at: Date.now() }
        set({ notifications: [full, ...state.notifications].slice(0, MAX_NOTIFICATIONS) })
      },

      dismissNotification: (id) => {
        set({ notifications: get().notifications.filter((n) => n.id !== id) })
      },

      resetGame: () => set({ ...initialState() }),
    }),
    {
      name: 'businesslife-save-v1',
      version: 1,
    },
  ),
)

/** Selector: the feature keys the player has unlocked so far. */
export function useUnlockedFeatures(): string[] {
  return useGameStore((s) => unlockedFeatures(s.completedLevels, s.levelIndex))
}
