import { openBuildings } from '../../state/contentStore'
import { clamp } from '../../shared/math'
import { CITY_LIMIT } from '../../data/cityMap'

const PLAYER_RADIUS = 0.45
/** Keeps the player on dry land, inside the city blueprint. */
const WORLD_LIMIT = CITY_LIMIT

/**
 * Pushes a proposed player position out of any building it has landed inside.
 *
 * Every building in the city is authored axis-aligned, so a plain AABB test is
 * exact here and much cheaper than a general mesh sweep. The player is ejected
 * along the shallowest axis, which makes them slide along a wall instead of
 * sticking to it.
 */
export function resolvePlayerPosition(x: number, z: number): { x: number; z: number } {
  let px = x
  let pz = z

  // Only the buildings that are actually standing block the player.
  for (const building of openBuildings()) {
    const halfX = building.size[0] / 2 + PLAYER_RADIUS
    const halfZ = building.size[2] / 2 + PLAYER_RADIUS
    const dx = px - building.position[0]
    const dz = pz - building.position[2]
    if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) continue

    const penetrationX = halfX - Math.abs(dx)
    const penetrationZ = halfZ - Math.abs(dz)
    if (penetrationX < penetrationZ) {
      px = building.position[0] + Math.sign(dx || 1) * halfX
    } else {
      pz = building.position[2] + Math.sign(dz || 1) * halfZ
    }
  }

  return {
    x: clamp(px, -WORLD_LIMIT, WORLD_LIMIT),
    z: clamp(pz, -WORLD_LIMIT, WORLD_LIMIT),
  }
}
