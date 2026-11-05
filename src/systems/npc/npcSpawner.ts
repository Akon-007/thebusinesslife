import type { NPCEntity, NPCAppearance, NPCRole, PersonalityTrait } from '../../types/npc'
import { ALL_PERSONALITIES } from '../../types/npc'
import type { Building } from '../../types/world'
import { DISTRICT_BY_ID } from '../../data/buildings'
import { ROLE_DEFS, ROLE_BY_ID } from '../../data/npcCatalog'
import { PERSONALITY_BEHAVIOUR } from '../../data/dialogues'
import { WAYPOINT_BY_ID, WAYPOINTS_BY_DISTRICT } from '../../data/waypoints'
import { districtFootfall, openBuildings, publishedInvestors, roleSpawnSettings } from '../../state/contentStore'
import { createRng, pick, randInt, randRange, type Rng } from '../../shared/rng'

function makeAppearance(rng: Rng, role: NPCRole): NPCAppearance {
  const def = ROLE_BY_ID[role]
  return {
    skin: pick(rng, def.skinColors),
    shirt: pick(rng, def.shirtColors),
    trousers: pick(rng, def.trousersColors),
    hair: pick(rng, def.hairColors),
    accessory: pick(rng, ['none', 'cap', 'bag', 'glasses', 'headtie', 'phone'] as const),
    heightScale: randRange(rng, 0.92, 1.08),
  }
}

function buildingsInDistrict(districtId: string): Building[] {
  return openBuildings().filter((b) => b.districtId === districtId)
}

/**
 * The districts a role may be placed in, repeated by their footfall so the
 * administrator's weighting is honoured by a plain uniform pick.
 *
 * Footfall 0 (or a district the administrator has closed) drops a district out
 * of the pool entirely. A role whose every district is closed gets nobody.
 */
function spawnPool(districts: string[]): string[] {
  const pool: string[] = []
  for (const districtId of districts) {
    const weight = Math.min(10, Math.max(0, districtFootfall(districtId)))
    for (let i = 0; i < weight; i++) pool.push(districtId)
  }
  return pool
}

/** One entity, placed at an anchor building its role cares about. */
function buildNpc(
  rng: Rng,
  options: {
    id: string
    name: string
    role: NPCRole
    districtId: string
    favouredBuildings: string[]
  },
): NPCEntity | null {
  const district = DISTRICT_BY_ID[options.districtId]
  if (!district) return null

  const candidates = buildingsInDistrict(options.districtId)
  const favoured = candidates.filter((b) => options.favouredBuildings.includes(b.type))
  const anchor: Building | undefined = favoured.length ? pick(rng, favoured) : pick(rng, candidates)

  const baseX = anchor ? anchor.position[0] : district.center[0]
  const baseZ = anchor ? anchor.position[2] : district.center[1]

  const personality: PersonalityTrait = pick(rng, ALL_PERSONALITIES)
  const behaviour = PERSONALITY_BEHAVIOUR[personality]

  return {
    id: options.id,
    name: options.name,
    role: options.role,
    personality,
    districtId: options.districtId,
    position: [
      baseX + randRange(rng, -8, 8),
      0,
      baseZ + randRange(rng, -8, 8),
    ],
    rotationY: randRange(rng, -Math.PI, Math.PI),
    state: 'idle',
    speed: randRange(rng, 2.6, 3.6) * behaviour.speed,
    path: [],
    pathIndex: 0,
    waitTimer: randRange(rng, 0.5, 4),
    talkingToId: null,
    homeBuildingId: anchor ? anchor.id : null,
    visitBuildingIds: favoured.slice(0, 3).map((b) => b.id),
    insideTimer: 0,
    interacted: {},
    appearance: makeAppearance(rng, options.role),
  }
}

/**
 * Seeds the city with a believable, role-distributed crowd.
 *
 * Each NPC is anchored to a district matching its occupation, given a home
 * building and a set of places it is willing to walk into, so the crowd
 * reflects the environment rather than being scattered at random.
 *
 * The size and placement of each role, and the districts themselves, come from
 * the administrator's published world settings; the catalogue in
 * `npcCatalog.ts` is the fallback when nothing has been published.
 *
 * Investors the portal has authored are added last: each one walks the business
 * district as a named investor, so the people a player meets match the funds
 * the administrator set up.
 */
export function spawnCityNPCs(seed = 20261102): NPCEntity[] {
  const rng = createRng(seed)
  const npcs: NPCEntity[] = []
  let counter = 0

  for (const def of ROLE_DEFS) {
    const settings = roleSpawnSettings(def.role)
    if (!settings.active) continue

    const pool = spawnPool(settings.districts)
    if (pool.length === 0) continue

    for (let i = 0; i < settings.spawnCount; i++) {
      const districtId = pick(rng, pool)
      const npc = buildNpc(rng, {
        id: `${def.role}_${counter++}`,
        name: pick(rng, def.names),
        role: def.role,
        districtId,
        favouredBuildings: def.favouredBuildings,
      })
      if (npc) npcs.push(npc)
    }
  }

  // Administered investors, published into the business district.
  const investorRole = ROLE_BY_ID.investor
  for (const investor of publishedInvestors()) {
    if (districtFootfall('d_business') <= 0) break
    const npc = buildNpc(rng, {
      id: `investor_${counter++}`,
      name: investor.name,
      role: 'investor',
      districtId: 'd_business',
      favouredBuildings: investorRole.favouredBuildings,
    })
    if (npc) npcs.push(npc)
  }

  return npcs
}

/** Waypoints belonging to a district, filtered to those that exist. */
export function districtWaypointIds(districtId: string): string[] {
  return (WAYPOINTS_BY_DISTRICT[districtId] ?? []).map((w) => w.id).filter((id) => !!WAYPOINT_BY_ID[id])
}

/** Nearest waypoint to a position, optionally restricted to one district. */
export function nearestWaypointId(
  position: [number, number, number],
  districtId?: string,
): string | null {
  const pool = districtId
    ? WAYPOINTS_BY_DISTRICT[districtId] ?? []
    : Object.values(WAYPOINT_BY_ID)
  let best: string | null = null
  let bestDist = Infinity
  for (const w of pool) {
    const d = Math.hypot(w.position[0] - position[0], w.position[2] - position[2])
    if (d < bestDist) {
      bestDist = d
      best = w.id
    }
  }
  return best
}
