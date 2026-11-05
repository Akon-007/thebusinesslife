import { api } from '../../api/client'
import type { ObjectiveType } from '../../types/mission'

/**
 * The shapes the content screens work with, and the translations between what
 * the API stores and what a form can hold.
 *
 * List-valued fields (prerequisites, conditions, and so on) are edited as one
 * per line, which is far easier to scan than a stack of single-line inputs.
 */

export interface LevelOverrideRecord {
  levelId: string
  summary: string | null
  requirements: string[] | null
  unlocks: string[] | null
  xpReward: number | null
  cashReward: number | null
  reputationReward: number | null
  active: boolean
  updatedAt: string
  updatedBy: string | null
}

export interface LevelRow {
  levelId: string
  index: number
  override: LevelOverrideRecord | null
  adoption: { reached: number; completed: number; completionRate: number }
  missions: { total: number; published: number }
}

export interface AdminObjective {
  id: string
  kind: 'required' | 'optional'
  type: ObjectiveType
  target: string
  text: string
  count: number
  hint: string | null
  hintLocation: string | null
}

export interface AdminMission {
  id: string
  levelId: string
  title: string
  description: string
  instructions: string
  type: string
  xpReward: number
  status: string
  prerequisites: string[]
  npcRequirements: string[]
  locationRequirements: string[]
  completionConditions: string[]
  evaluationCriteria: string[]
  failureConditions: string[]
  recoveryInstructions: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  objectives: AdminObjective[]
}

export interface Vocabulary {
  missionTypes: { value: string; label: string }[]
  objectiveTypes: { value: string; label: string }[]
  unlockKeys: { value: string; label: string }[]
  missionStatuses: string[]
  objectiveKinds: string[]
  levels: string[]
}

export interface DraftObjective {
  kind: 'required' | 'optional'
  type: ObjectiveType
  target: string
  text: string
  count: number
  hint: string
  hintLocation: string
}

export interface MissionDraft {
  levelId: string
  title: string
  description: string
  instructions: string
  type: string
  xpReward: number
  prerequisites: string
  npcRequirements: string
  locationRequirements: string
  completionConditions: string
  evaluationCriteria: string
  failureConditions: string
  recoveryInstructions: string
  objectives: DraftObjective[]
}

/** Textarea contents → the array the API validates. */
export function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function listToLines(values: string[]): string {
  return values.join('\n')
}

export function emptyObjective(): DraftObjective {
  return {
    kind: 'required',
    type: 'visit_building',
    target: '',
    text: '',
    count: 1,
    hint: '',
    hintLocation: '',
  }
}

export function emptyDraft(levelId: string): MissionDraft {
  return {
    levelId,
    title: '',
    description: '',
    instructions: '',
    type: 'main',
    xpReward: 100,
    prerequisites: '',
    npcRequirements: '',
    locationRequirements: '',
    completionConditions: '',
    evaluationCriteria: '',
    failureConditions: '',
    recoveryInstructions: '',
    objectives: [emptyObjective()],
  }
}

export function draftFromMission(mission: AdminMission): MissionDraft {
  return {
    levelId: mission.levelId,
    title: mission.title,
    description: mission.description,
    instructions: mission.instructions,
    type: mission.type,
    xpReward: mission.xpReward,
    prerequisites: listToLines(mission.prerequisites),
    npcRequirements: listToLines(mission.npcRequirements),
    locationRequirements: listToLines(mission.locationRequirements),
    completionConditions: listToLines(mission.completionConditions),
    evaluationCriteria: listToLines(mission.evaluationCriteria),
    failureConditions: listToLines(mission.failureConditions),
    recoveryInstructions: mission.recoveryInstructions,
    objectives: mission.objectives.map((objective) => ({
      kind: objective.kind,
      type: objective.type,
      target: objective.target,
      text: objective.text,
      count: objective.count,
      hint: objective.hint ?? '',
      hintLocation: objective.hintLocation ?? '',
    })),
  }
}

export function draftToPayload(draft: MissionDraft) {
  return {
    levelId: draft.levelId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    instructions: draft.instructions.trim(),
    type: draft.type,
    xpReward: Math.max(0, Math.round(draft.xpReward)),
    prerequisites: linesToList(draft.prerequisites),
    npcRequirements: linesToList(draft.npcRequirements),
    locationRequirements: linesToList(draft.locationRequirements),
    completionConditions: linesToList(draft.completionConditions),
    evaluationCriteria: linesToList(draft.evaluationCriteria),
    failureConditions: linesToList(draft.failureConditions),
    recoveryInstructions: draft.recoveryInstructions.trim(),
    objectives: draft.objectives.map((objective) => ({
      kind: objective.kind,
      type: objective.type,
      target: objective.target.trim(),
      text: objective.text.trim(),
      count: Math.max(1, Math.round(objective.count)),
      hint: objective.hint.trim() || null,
      hintLocation: objective.hintLocation.trim() || null,
    })),
  }
}

/** A one-line description of what an objective watches, for the preview. */
export function objectiveTargetLabel(objective: DraftObjective, vocabulary: Vocabulary | null): string {
  const typeLabel =
    vocabulary?.objectiveTypes.find((entry) => entry.value === objective.type)?.label ?? objective.type
  const target = objective.target.trim() || '—'
  return `${typeLabel}: ${target}`
}

/** Loads the controlled vocabularies the builder renders. */
export function fetchVocabulary(): Promise<Vocabulary> {
  return api<Vocabulary>('/admin/content/meta')
}
