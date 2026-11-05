import { api } from '../api/client'
import { BUILDINGS, DISTRICTS } from '../data/buildings'
import { LEVEL_BY_ID } from '../data/beginnerLevels'
import { MISSION_BY_LEVEL } from '../data/missions'
import { ROLE_BY_ID } from '../data/npcCatalog'
import { SECTORS, SECTOR_BRIEFINGS } from '../data/sectors'
import type { Mission, Objective } from '../types/mission'
import type { LevelDef } from '../types/progression'
import type { Building } from '../types/world'

/**
 * Content authored or retuned in the administrator portal.
 *
 * The stages, the fifteen Beginner levels and the default missions stay owned by
 * the client — nothing here replaces them. This module holds only the
 * administrator's *deviations*, fetched once when the player enters the city,
 * and the progression layer merges them on top of the catalogue.
 *
 * The same applies to the world: the districts, buildings, NPC roles and
 * business sectors are a client contract, and the portal can only retune how
 * many people walk the streets, which places are open and which sectors a new
 * player may choose from.
 *
 * If the fetch fails the catalogue simply stands, so the game never depends on
 * the portal being reachable.
 */

export interface LevelOverride {
  levelId: string
  summary: string | null
  requirements: string[] | null
  unlocks: string[] | null
  xpReward: number | null
  cashReward: number | null
  reputationReward: number | null
  /** When false the level reverts to the published catalogue for players. */
  active: boolean
}

interface ServedMission {
  id: string
  levelId: string
  title: string
  briefing: string
  instructions: string
  type: string
  xpReward: number
  updatedAt: string
  objectives: (Objective & { kind: 'required' | 'optional' })[]
}

const overrides = new Map<string, LevelOverride>()
const missions = new Map<string, Mission>()

/** Merges an administrator's override onto a catalogue level. */
function applyOverride(base: LevelDef): LevelDef {
  const override = overrides.get(base.id)
  if (!override || !override.active) return base

  return {
    ...base,
    summary: override.summary ?? base.summary,
    requirements: override.requirements ?? base.requirements,
    unlocks: override.unlocks ?? base.unlocks,
    rewards: {
      xp: override.xpReward ?? base.rewards.xp,
      cash: override.cashReward ?? base.rewards.cash,
      reputation: override.reputationReward ?? base.rewards.reputation,
    },
  }
}

/** A level as the player should see it: catalogue, plus any published changes. */
export function resolvedLevel(levelId: string): LevelDef | undefined {
  const base = LEVEL_BY_ID[levelId]
  return base ? applyOverride(base) : undefined
}

/** The mission for a level: an authored, published one if there is one. */
export function resolvedMission(levelId: string): Mission | undefined {
  return missions.get(levelId) ?? MISSION_BY_LEVEL[levelId]
}

function toMission(served: ServedMission): Mission {
  return {
    levelId: served.levelId,
    title: served.title,
    // The builder separates the story briefing from the practical instructions;
    // the player reads them as one piece of text.
    briefing: served.instructions
      ? `${served.briefing}\n\n${served.instructions}`
      : served.briefing,
    objectives: served.objectives.map((objective) => ({
      id: objective.id,
      text: objective.text,
      type: objective.type,
      target: objective.target,
      count: objective.count,
      kind: objective.kind,
      hint: objective.hint,
      hintLocation: objective.hintLocation,
    })),
  }
}

/** True once the authored content has been fetched, successfully or not. */
let loaded = false

export function contentLoaded(): boolean {
  return loaded
}

/**
 * Fetches the administrator's content changes. Called once, before the city is
 * rendered, so every consumer sees a settled picture.
 */
export async function loadAuthoredContent(): Promise<void> {
  try {
    const payload = await api<{ levels: LevelOverride[]; missions: ServedMission[] }>('/player/content')

    overrides.clear()
    for (const level of payload.levels) overrides.set(level.levelId, level)

    missions.clear()
    // The server sends the newest published mission first, so the first one seen
    // for a level is the one that wins.
    for (const mission of payload.missions) {
      if (missions.has(mission.levelId)) continue
      if (overrides.get(mission.levelId)?.active === false) continue
      missions.set(mission.levelId, toMission(mission))
    }
  } catch {
    // The catalogue is the fallback: an unreachable portal changes nothing.
    overrides.clear()
    missions.clear()
  } finally {
    loaded = true
  }
}

/* ------------------------------------------------------------- the world -- */

/** An administrator's deviations from the world catalogue. */
interface WorldConfig {
  roleSpawns: Map<string, { spawnCount: number | null; spawnDistricts: string[] | null; active: boolean | null }>
  sectors: Map<string, { active: boolean | null; briefing: string | null }>
  districts: Map<string, { active: boolean | null; footfall: number | null }>
  closedBuildings: Set<string>
  investors: InvestorRecord[]
}

/** An investor the portal has put into the city. */
export interface InvestorRecord {
  id: string
  name: string
  organisation: string
  stageFocus: string
  ticket: string
  sectors: string[]
}

const world: WorldConfig = {
  roleSpawns: new Map(),
  sectors: new Map(),
  districts: new Map(),
  closedBuildings: new Set(),
  investors: [],
}

/**
 * How many of a role should walk the streets, where, and whether at all.
 *
 * A null column means the catalogue value stands, so a half-filled override
 * never zeroes out something the designer specified.
 */
export function roleSpawnSettings(role: string): {
  spawnCount: number
  districts: string[]
  active: boolean
} {
  const base = ROLE_BY_ID[role as keyof typeof ROLE_BY_ID]
  const config = world.roleSpawns.get(role)

  return {
    spawnCount: config?.spawnCount ?? base?.spawnCount ?? 0,
    districts: config?.spawnDistricts ?? base?.spawnDistricts ?? [],
    active: config?.active ?? true,
  }
}

/** Districts the crowd may be placed in: open districts, weighted by footfall. */
export function districtFootfall(districtId: string): number {
  const config = world.districts.get(districtId)
  if (config?.active === false) return 0
  return config?.footfall ?? 1
}

/** Which district each building belongs to, so the hot paths avoid a scan. */
const BUILDING_DISTRICT = new Map(BUILDINGS.map((building) => [building.id, building.districtId]))

/** A district the administrator has closed takes its buildings with it. */
export function buildingIsOpen(buildingId: string): boolean {
  if (world.closedBuildings.has(buildingId)) return false
  const districtId = BUILDING_DISTRICT.get(buildingId)
  return districtId === undefined || districtFootfall(districtId) > 0
}

/** The city as it currently stands: open districts, open buildings. */
export function openDistricts() {
  return DISTRICTS.filter((district) => districtFootfall(district.id) > 0)
}

export function openBuildings(): Building[] {
  return BUILDINGS.filter((building) => buildingIsOpen(building.id))
}

/** The business sectors a new player may choose from, and their briefings. */
export function sectorOptions(): { sector: string; briefing: string | null }[] {
  return SECTORS.filter((sector) => world.sectors.get(sector)?.active !== false).map((sector) => ({
    sector,
    briefing: world.sectors.get(sector)?.briefing ?? SECTOR_BRIEFINGS[sector] ?? null,
  }))
}

/** The investors the portal has published into the city. */
export function publishedInvestors(): InvestorRecord[] {
  return world.investors
}

interface WorldConfigPayload {
  roles: {
    role: string
    spawnCount: number | null
    spawnDistricts: string[] | null
    active: boolean | null
  }[]
  sectors: { sector: string; active: boolean | null; briefing: string | null }[]
  districts: { districtId: string; active: boolean | null; footfall: number | null }[]
  buildings: { buildingId: string; active: boolean | null }[]
  investors: InvestorRecord[]
}

/**
 * Fetches the world settings. Called once, before the crowd is seeded, so the
 * instanced meshes always mount with their final instance count.
 *
 * A failure is not fatal: the city simply looks exactly as the catalogue
 * describes it.
 */
export async function loadWorldConfig(): Promise<void> {
  try {
    const payload = await api<WorldConfigPayload>('/world/config')

    world.roleSpawns.clear()
    for (const role of payload.roles) {
      world.roleSpawns.set(role.role, {
        spawnCount: role.spawnCount,
        spawnDistricts: role.spawnDistricts,
        active: role.active,
      })
    }

    world.sectors.clear()
    for (const sector of payload.sectors) {
      world.sectors.set(sector.sector, { active: sector.active, briefing: sector.briefing })
    }

    world.districts.clear()
    for (const district of payload.districts) {
      world.districts.set(district.districtId, {
        active: district.active,
        footfall: district.footfall,
      })
    }

    world.closedBuildings.clear()
    for (const building of payload.buildings) {
      if (building.active === false) world.closedBuildings.add(building.buildingId)
    }

    world.investors = payload.investors
  } catch {
    world.roleSpawns.clear()
    world.sectors.clear()
    world.districts.clear()
    world.closedBuildings.clear()
    world.investors = []
  }
}
