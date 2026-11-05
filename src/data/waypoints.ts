import type { District, Waypoint } from '../types/world'
import { BUILDINGS, DISTRICTS } from './buildings'

/**
 * Derives the NPC walking network from the city layout.
 *
 * Topology: every building gets an entrance node placed in front of its facade.
 * Each entrance links to its district hub, each hub links to its neighbours in a
 * ring, and entrances also link to their closest sibling entrance in the same
 * district so crowds spread out instead of funnelling through one point.
 */
export function buildWaypoints(): Waypoint[] {
  const nodes: Waypoint[] = []
  const hubId = (d: District) => `wp_hub_${d.id}`

  // 1. One hub per district, in the middle of the district.
  for (const d of DISTRICTS) {
    nodes.push({
      id: hubId(d),
      districtId: d.id,
      position: [d.center[0], 0, d.center[1]],
      links: [],
      buildingId: null,
    })
  }

  // 2. Ring the hubs together so every district is reachable on foot.
  for (let i = 0; i < DISTRICTS.length; i++) {
    const a = nodes.find((n) => n.id === hubId(DISTRICTS[i]))!
    const b = nodes.find((n) => n.id === hubId(DISTRICTS[(i + 1) % DISTRICTS.length]))!
    a.links.push(b.id)
    b.links.push(a.id)
  }

  // 3. Building entrance nodes, pushed out from the facade toward the district centre.
  const entranceByBuilding = new Map<string, string>()
  for (const b of BUILDINGS) {
    const district = DISTRICTS.find((d) => d.id === b.districtId)!
    const dx = district.center[0] - b.position[0]
    const dz = district.center[1] - b.position[2]
    const len = Math.hypot(dx, dz) || 1
    const nx = dx / len
    const nz = dz / len
    // Push past the footprint edge plus a sidewalk margin.
    const reach = Math.min(b.size[0], b.size[2]) / 2 + 7
    const id = `wp_ent_${b.id}`
    nodes.push({
      id,
      districtId: b.districtId,
      position: [b.position[0] + nx * reach, 0, b.position[2] + nz * reach],
      links: [],
      buildingId: b.id,
    })
    entranceByBuilding.set(b.id, id)

    // Link the entrance to its district hub.
    const hub = nodes.find((n) => n.id === hubId(district))!
    hub.links.push(id)
    nodes[nodes.length - 1].links.push(hub.id)
  }

  // 4. Link each entrance to its nearest sibling entrance in the same district.
  for (const b of BUILDINGS) {
    const id = entranceByBuilding.get(b.id)!
    const self = nodes.find((n) => n.id === id)!
    const siblings = BUILDINGS.filter((o) => o.districtId === b.districtId && o.id !== b.id)
      .map((o) => ({ o, node: nodes.find((n) => n.id === entranceByBuilding.get(o.id))! }))
      .sort(
        (p, q) =>
          dist2(p.node.position, self.position) - dist2(q.node.position, self.position),
      )
    const nearest = siblings[0]
    if (nearest && !self.links.includes(nearest.node.id)) {
      self.links.push(nearest.node.id)
      nearest.node.links.push(self.id)
    }
  }

  return nodes
}

function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0]
  const dz = a[2] - b[2]
  return dx * dx + dz * dz
}

/** Nodes indexed by id, built once at module load. */
export const WAYPOINTS: Waypoint[] = buildWaypoints()

export const WAYPOINT_BY_ID = Object.fromEntries(WAYPOINTS.map((w) => [w.id, w])) as Record<
  string,
  Waypoint
>

export const WAYPOINTS_BY_DISTRICT = WAYPOINTS.reduce<Record<string, Waypoint[]>>((acc, w) => {
  ;(acc[w.districtId] ||= []).push(w)
  return acc
}, {})

/** The entrance waypoint for a building, if it has one. */
export function entranceWaypointFor(buildingId: string): string | null {
  const id = `wp_ent_${buildingId}`
  return WAYPOINT_BY_ID[id] ? id : null
}
