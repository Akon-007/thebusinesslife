export type BuildingType =
  | 'office'
  | 'bank'
  | 'registration_office'
  | 'market'
  | 'mall'
  | 'restaurant'
  | 'warehouse'
  | 'residential'
  | 'business_hub'

export type DistrictTheme =
  | 'commercial'
  | 'market'
  | 'business_district'
  | 'residential'
  | 'industrial'
  | 'civic'

export interface District {
  id: string
  name: string
  /** The name as it fits on a map pin, where the full one will not. */
  short: string
  theme: DistrictTheme
  /** Centre of the district in world space. */
  center: [number, number]
  /** Half-extent of the district footprint. */
  size: [number, number]
  groundColor: string
}

export interface Building {
  id: string
  districtId: string
  type: BuildingType
  name: string
  /** Centre of the building footprint. */
  position: [number, number, number]
  /** Footprint size (x, z) and height (y). */
  size: [number, number, number]
  rotationY: number
  color: string
  roofColor: string
  /** Short Nigerian-style signage text rendered on the facade. */
  sign: string
}

/** How a road reads on the map and in the world. */
export type RoadKind = 'highway' | 'avenue' | 'street'

/** A straight road segment. Roads are authored as axis-aligned or rotated bars. */
export interface RoadDef {
  id: string
  kind: RoadKind
  name?: string
  /** Centre of the segment in world space. */
  x: number
  z: number
  /** Length along the segment's local axis and its width across. */
  length: number
  width: number
  /** Yaw in radians. */
  rotation: number
}

/** A body of water (the lagoon and its creeks), drawn as a rotated rectangle. */
export interface WaterDef {
  id: string
  name?: string
  x: number
  z: number
  width: number
  depth: number
  rotation: number
}

/** A paved waterfront promenade the city faces the lagoon across. */
export interface PromenadeDef {
  id: string
  x: number
  z: number
  length: number
  width: number
  rotation: number
}

/** A node in the NPC walking network. */
export interface Waypoint {
  id: string
  districtId: string
  position: [number, number, number]
  /** Neighbouring waypoint ids the NPC may walk to. */
  links: string[]
  /** Waypoints that sit next to a building entrance are good enter/exit targets. */
  buildingId: string | null
}
