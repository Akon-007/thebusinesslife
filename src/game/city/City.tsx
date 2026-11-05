import * as THREE from 'three'
import type { PromenadeDef, RoadDef, WaterDef } from '../../types/world'
import { openBuildings, openDistricts } from '../../state/contentStore'
import { PROMENADES, ROADS, ROAD_COLOR, WATER, WATER_COLOR } from '../../data/cityMap'
import { Building } from './Building'
import { Props } from './Props'

/**
 * The avenue grid lives in the city blueprint; re-exported here so the street
 * furniture and the maps keep reading from the same numbers.
 */
export { AVENUE_LENGTH, AVENUE_WIDTH, AVENUE_X, AVENUE_Z } from '../../data/cityMap'

/** A flat, rotated rectangle laid on the ground — used for every surface. */
function Slab({
  x,
  z,
  length,
  width,
  rotation,
  y,
  color,
  emissive,
}: {
  x: number
  z: number
  length: number
  width: number
  rotation: number
  y: number
  color: string
  emissive?: string
}) {
  // A segment running north-south is just the rectangle rotated a quarter turn.
  const alongZ = Math.abs(rotation) > Math.PI / 4
  const w = alongZ ? width : length
  const d = alongZ ? length : width
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshLambertMaterial color={color} emissive={emissive} />
    </mesh>
  )
}

function RoadSurface({ road }: { road: RoadDef }) {
  return (
    <Slab
      x={road.x}
      z={road.z}
      length={road.length}
      width={road.width}
      rotation={road.rotation}
      y={0.02}
      color={ROAD_COLOR[road.kind]}
    />
  )
}

function Water({ water }: { water: WaterDef }) {
  return (
    <Slab
      x={water.x}
      z={water.z}
      length={water.width}
      width={water.depth}
      rotation={water.rotation}
      y={0.004}
      color={WATER_COLOR}
      emissive="#06222f"
    />
  )
}

function Promenade({ prom }: { prom: PromenadeDef }) {
  return (
    <>
      {/* the paved walk itself */}
      <Slab
        x={prom.x}
        z={prom.z}
        length={prom.length}
        width={prom.width}
        rotation={prom.rotation}
        y={0.012}
        color="#c3bcab"
      />
      {/* a darker kerb line along the water's edge */}
      <Slab
        x={prom.x}
        z={prom.z + prom.width / 2 + 1}
        length={prom.length}
        width={2}
        rotation={prom.rotation}
        y={0.014}
        color="#8d8779"
      />
    </>
  )
}

/**
 * The whole city: the lagoon and its creeks, the promenade the city faces the
 * water across, the avenue grid, one paving tile per district, the interactive
 * buildings and the street furniture.
 *
 * The layout comes from `data/cityMap.ts`, the same blueprint the map screens
 * draw, so what you see on the minimap is literally where you are standing.
 *
 * Which districts and buildings are present follows the administrator's
 * published city settings: a closed building is removed here, from collision
 * and from interaction, so "closed" means closed everywhere it matters.
 */
export function City() {
  const districts = openDistricts()
  const buildings = openBuildings()

  return (
    <group>
      {/* base ground, wide enough to hold the lagoon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshLambertMaterial color="#7f7869" />
      </mesh>

      {/* the lagoon and the creek, laid under the paving and streets */}
      {WATER.map((w) => (
        <Water key={w.id} water={w} />
      ))}

      {/* district paving, sized from the same blueprint the map draws */}
      {districts.map((d) => (
        <mesh
          key={d.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[d.center[0], 0.01, d.center[1]]}
          receiveShadow
        >
          <planeGeometry args={[d.size[0] * 2, d.size[1] * 2]} />
          <meshLambertMaterial color={d.groundColor} />
        </mesh>
      ))}

      {/* the waterfront the city faces the lagoon across */}
      {PROMENADES.map((p) => (
        <Promenade key={p.id} prom={p} />
      ))}

      {/* every carriageway, from the blueprint */}
      {ROADS.map((r) => (
        <RoadSurface key={r.id} road={r} />
      ))}

      {/* a paved hub at the centre of each district */}
      {districts.map((d) => (
        <mesh
          key={`hub_${d.id}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[d.center[0], 0.03, d.center[1]]}
          receiveShadow
        >
          <circleGeometry args={[9, 32]} />
          <meshLambertMaterial color="#8e8a7d" side={THREE.DoubleSide} />
        </mesh>
      ))}

      {buildings.map((b) => (
        <Building key={b.id} building={b} />
      ))}

      <Props />
    </group>
  )
}
