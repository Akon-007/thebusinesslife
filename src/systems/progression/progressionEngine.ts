import { BEGINNER_LEVELS } from '../../data/beginnerLevels'
import { STAGE_BY_ID } from '../../data/stages'
import { resolvedLevel, resolvedMission } from '../../state/contentStore'
import type { LevelDef, Stage, UnlockKey } from '../../types/progression'
import type { Mission } from '../../types/mission'

/**
 * The progression layer.
 *
 * Levels and missions are read through `contentStore`, which layers any changes
 * an administrator published in the portal over the frozen catalogue. With no
 * portal changes this behaves exactly as reading the catalogue directly.
 */

/** The level the player is currently working on, 1-indexed. */
export function currentLevelDef(levelIndex: number): LevelDef {
  return (
    resolvedLevel(`L${levelIndex}`) ??
    resolvedLevel(BEGINNER_LEVELS[BEGINNER_LEVELS.length - 1].id) ??
    BEGINNER_LEVELS[BEGINNER_LEVELS.length - 1]
  )
}

export function missionForLevel(levelIndex: number): Mission | undefined {
  return resolvedMission(`L${levelIndex}`)
}

export function stageForLevel(levelIndex: number): Stage {
  const level = BEGINNER_LEVELS.find((l) => l.index === levelIndex)
  return STAGE_BY_ID[level?.stageId ?? 'beginner']
}

/**
 * Every feature unlocked by the levels the player has already completed, plus
 * the features granted by the level currently in progress.
 *
 * Unlocks are cumulative: finishing L4 keeps `company_registration` forever.
 * The current level is included because a level's own objectives routinely
 * require the feature that same level grants (L3 asks you to write the business
 * plan it unlocks, L4 asks you to register the company, and so on).
 */
export function unlockedFeatures(completedLevels: string[], levelIndex?: number): UnlockKey[] {
  const set = new Set<UnlockKey>()
  for (const id of completedLevels) {
    const level = resolvedLevel(id)
    if (!level) continue
    for (const key of level.unlocks) set.add(key as UnlockKey)
  }
  if (levelIndex !== undefined) {
    const current = resolvedLevel(`L${levelIndex}`)
    for (const key of current?.unlocks ?? []) set.add(key as UnlockKey)
  }
  return [...set]
}

export function isLastBeginnerLevel(levelIndex: number): boolean {
  return levelIndex >= BEGINNER_LEVELS.length
}

/** XP needed to advance within a level band; purely a HUD progress display. */
export function xpForLevel(levelIndex: number): number {
  return 100 + (levelIndex - 1) * 40
}
