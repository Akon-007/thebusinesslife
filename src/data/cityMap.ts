import type { PromenadeDef, RoadDef, WaterDef } from '../types/world'

/**
 * The city blueprint.
 *
 * One description of how Lagos is laid out — the avenue grid, the lagoon and
 * creeks, the waterfront promenade — consumed by BOTH the 3D world (`City.tsx`)
 * and the map screens (`Minimap`, `MapPanel`). Keeping it in one place is what
 * makes the map a true plan of the city rather than a separate drawing that can
 * drift away from it.
 *
 * Districts sit on the avenue grid: columns at x = -110 / 0 / 110 and rows at
 * z = -110 (mainland) and z = 110 (island). The lagoon closes the city off to
 * the south, behind a promenade, exactly as the water frames Lagos.
 *
 * All coordinates are world-space metres.
 */

/** Half-extent of the walkable city. Beyond this is the lagoon and the creek. */
export const CITY_LIMIT = 146

/** The span the maps cover, wide enough that the lagoon stays in frame. */
export const CITY_SPAN = 680

/** Avenues run along x at these z values, and along z at these x values. */
export const AVENUE_Z = [-110, 110]
export const AVENUE_X = [-110, 0, 110]
export const AVENUE_WIDTH = 20
export const AVENUE_LENGTH = 330

function road(
  id: string,
  kind: RoadDef['kind'],
  x: number,
  z: number,
  length: number,
  width: number,
  rotation: number,
  name?: string,
): RoadDef {
  return { id, kind, x, z, length, width, rotation, name }
}

/** Every carriageway in the city. Rotation 0 runs along x, PI/2 runs along z. */
export const ROADS: RoadDef[] = [
  // The two main avenues across the city.
  ...AVENUE_Z.map((z) =>
    road(`rd_h${z}`, 'avenue', 0, z, AVENUE_LENGTH, AVENUE_WIDTH, 0,
      z < 0 ? 'Iddo Mainland Avenue' : 'Broad Street'),
  ),
  // The three avenues running north to the waterfront.
  ...AVENUE_X.map((x) =>
    road(`rd_v${x}`, 'avenue', x, 0, AVENUE_LENGTH, AVENUE_WIDTH, Math.PI / 2,
      x < 0 ? 'Balogun Avenue' : x > 0 ? 'Ikoyi Avenue' : 'Marina Avenue'),
  ),
  // Side streets that break the super-blocks into city blocks.
  road('rd_h0', 'street', 0, 0, AVENUE_LENGTH, 16, 0, 'Campbell Street'),
  road('rd_vw', 'street', -55, 0, AVENUE_LENGTH, 14, Math.PI / 2, 'Oshodi Street'),
  road('rd_ve', 'street', 55, 0, AVENUE_LENGTH, 14, Math.PI / 2, 'Adeola Street'),
  // The waterfront highway the city faces the lagoon across.
  road('rd_coast', 'highway', 0, 136, 420, 18, 0, 'Ahmadu Bello Way'),
]

/** The lagoon and the creek that makes Lagos a city on water. */
export const WATER: WaterDef[] = [
  { id: 'w_lagoon', name: 'Lagos Lagoon', x: 0, z: 218, width: 760, depth: 128, rotation: 0 },
  { id: 'w_creek', name: 'Five Cowrie Creek', x: 216, z: 30, width: 58, depth: 340, rotation: 0 },
]

/** The paved promenade between the waterfront highway and the lagoon. */
export const PROMENADES: PromenadeDef[] = [
  { id: 'pm_marina', x: 0, z: 150, length: 424, width: 13, rotation: 0 },
]

/** Road paint colour per kind, shared by the world and the map. */
export const ROAD_COLOR: Record<RoadDef['kind'], string> = {
  highway: '#4a4a52',
  avenue: '#3b3b40',
  street: '#34343a',
}

/** Map-only colours so the plan reads clearly at a glance. */
export const WATER_COLOR = '#1d4e6b'
export const MAP_WATER_COLOR = '#123c56'
