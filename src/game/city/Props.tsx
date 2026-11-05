import { useMemo } from 'react'
import { createRng, randRange, pick } from '../../shared/rng'

/**
 * Street furniture that makes the city read as Lagos rather than an empty grid:
 * danfo buses, keke napeps, market stalls, trees, street lights and generator
 * sets.
 *
 * Everything is placed from a seeded RNG so the city is identical on every load,
 * and everything is deliberately offset from the walkways the NPCs use so props
 * never look like they are blocking the crowd.
 */

const DANFO = '#f4c20d'
const KEKE = '#e3b505'
const TRUCK_COLORS = ['#c8ccd0', '#8d9aa6', '#b0a89c', '#7f8a94']
const STALL_COLORS = ['#e11d48', '#0ea5e9', '#16a34a', '#f59e0b', '#7c3aed']
const AWNING_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed']

interface Vehicle {
  x: number
  z: number
  rot: number
  kind: 'danfo' | 'keke' | 'truck'
  color: string
}

interface Stall {
  x: number
  z: number
  rot: number
  color: string
}

/** Avenues run along x at these z values, and along z at these x values. */
const AVENUE_Z = [-110, 110]
const AVENUE_X = [-110, 0, 110]

function useCityProps() {
  return useMemo(() => {
    const rng = createRng(9931)
    const vehicles: Vehicle[] = []
    const stalls: Stall[] = []
    const trees: { x: number; z: number; s: number }[] = []
    const lamps: { x: number; z: number }[] = []
    const crates: { x: number; z: number; rot: number }[] = []
    const generators: { x: number; z: number }[] = []

    // --- vehicles parked and waiting along every avenue ---
    for (const z of AVENUE_Z) {
      for (let x = -140; x <= 140; x += 34) {
        const kind = rng.next() < 0.55 ? 'danfo' : rng.next() < 0.6 ? 'keke' : 'truck'
        vehicles.push({
          x: x + randRange(rng, -6, 6),
          z: z + (rng.next() < 0.5 ? -6.5 : 6.5),
          rot: 0,
          kind,
          color: kind === 'danfo' ? DANFO : kind === 'keke' ? KEKE : pick(rng, TRUCK_COLORS),
        })
      }
    }
    for (const x of AVENUE_X) {
      for (let z = -140; z <= 140; z += 40) {
        const kind = rng.next() < 0.5 ? 'danfo' : 'truck'
        vehicles.push({
          x: x + (rng.next() < 0.5 ? -6.5 : 6.5),
          z: z + randRange(rng, -6, 6),
          rot: Math.PI / 2,
          kind,
          color: kind === 'danfo' ? DANFO : pick(rng, TRUCK_COLORS),
        })
      }
    }

    // --- market stalls in the open ground of the trading districts ---
    const stallDistricts: { cx: number; cz: number }[] = [
      { cx: -110, cz: -100 }, // Balogun Market
      { cx: -100, cz: 100 }, // Yaba
      { cx: 10, cz: -98 }, // Broad Street
    ]
    for (const site of stallDistricts) {
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + randRange(rng, -0.3, 0.3)
        const radius = randRange(rng, 7, 13)
        stalls.push({
          x: site.cx + Math.cos(angle) * radius,
          z: site.cz + Math.sin(angle) * radius,
          rot: angle + Math.PI,
          color: pick(rng, STALL_COLORS),
        })
      }
    }

    // --- trees and street lights framing the avenues ---
    for (const z of AVENUE_Z) {
      for (let x = -150; x <= 150; x += 24) {
        trees.push({ x, z: z - 17, s: randRange(rng, 0.85, 1.35) })
        trees.push({ x: x + 12, z: z + 17, s: randRange(rng, 0.85, 1.35) })
        lamps.push({ x: x + 6, z: z - 15.5 })
        lamps.push({ x: x + 6, z: z + 15.5 })
      }
    }
    for (const x of AVENUE_X) {
      for (let z = -150; z <= 150; z += 30) {
        trees.push({ x: x - 17, z, s: randRange(rng, 0.85, 1.3) })
        lamps.push({ x: x + 15.5, z: z + 10 })
      }
    }

    // --- crates and generator sets around the industrial district ---
    const industrial = { cx: 110, cz: 110 }
    for (let i = 0; i < 14; i++) {
      const angle = randRange(rng, 0, Math.PI * 2)
      const radius = randRange(rng, 10, 26)
      crates.push({
        x: industrial.cx + Math.cos(angle) * radius,
        z: industrial.cz + Math.sin(angle) * radius,
        rot: randRange(rng, 0, Math.PI),
      })
    }
    for (let i = 0; i < 6; i++) {
      const angle = randRange(rng, 0, Math.PI * 2)
      const radius = randRange(rng, 12, 24)
      generators.push({
        x: industrial.cx + Math.cos(angle) * radius,
        z: industrial.cz + Math.sin(angle) * radius,
      })
    }

    return { vehicles, stalls, trees, lamps, crates, generators }
  }, [])
}

export function Props() {
  const { vehicles, stalls, trees, lamps, crates, generators } = useCityProps()

  return (
    <group>
      {vehicles.map((v, i) => (
        <group key={`v${i}`} position={[v.x, 0, v.z]} rotation={[0, v.rot, 0]}>
          {v.kind === 'keke' ? (
            <>
              <mesh castShadow position={[0, 0.55, 0]}>
                <boxGeometry args={[1.1, 1.1, 2]} />
                <meshLambertMaterial color={v.color} />
              </mesh>
              <mesh position={[0, 1.35, -0.1]}>
                <boxGeometry args={[1.15, 0.5, 1.3]} />
                <meshLambertMaterial color="#1f2937" />
              </mesh>
            </>
          ) : (
            <>
              <mesh castShadow position={[0, 1.05, 0]}>
                <boxGeometry args={[2.4, v.kind === 'truck' ? 2 : 1.7, v.kind === 'truck' ? 6 : 4.6]} />
                <meshLambertMaterial color={v.color} />
              </mesh>
              {/* cabin + window band */}
              <mesh position={[0, v.kind === 'truck' ? 1.9 : 1.65, v.kind === 'truck' ? 2 : 1.4]}>
                <boxGeometry args={[2.3, v.kind === 'truck' ? 1.4 : 1, v.kind === 'truck' ? 2 : 1.8]} />
                <meshLambertMaterial color="#1e293b" />
              </mesh>
            </>
          )}
        </group>
      ))}

      {stalls.map((s, i) => (
        <group key={`s${i}`} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[2.2, 1, 1.2]} />
            <meshLambertMaterial color="#6b4a2a" />
          </mesh>
          {/* striped awning */}
          <mesh position={[0, 1.85, 0]} rotation={[0.18, 0, 0]}>
            <boxGeometry args={[2.6, 0.12, 2]} />
            <meshLambertMaterial color={s.color} />
          </mesh>
          <mesh position={[-1.1, 1.35, 0]}>
            <boxGeometry args={[0.1, 1.7, 0.1]} />
            <meshLambertMaterial color="#4b3a24" />
          </mesh>
          <mesh position={[1.1, 1.35, 0]}>
            <boxGeometry args={[0.1, 1.7, 0.1]} />
            <meshLambertMaterial color="#4b3a24" />
          </mesh>
        </group>
      ))}

      {trees.map((t, i) => (
        <group key={`t${i}`} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh castShadow position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 2.2, 6]} />
            <meshLambertMaterial color="#5b4227" />
          </mesh>
          <mesh castShadow position={[0, 2.9, 0]}>
            <icosahedronGeometry args={[1.35, 0]} />
            <meshLambertMaterial color="#3f7a34" />
          </mesh>
        </group>
      ))}

      {lamps.map((l, i) => (
        <group key={`l${i}`} position={[l.x, 0, l.z]}>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.09, 0.13, 5.2, 6]} />
            <meshLambertMaterial color="#4b5563" />
          </mesh>
          <mesh position={[0, 5.2, 0]}>
            <boxGeometry args={[0.7, 0.18, 0.4]} />
            <meshLambertMaterial color="#6b7280" />
          </mesh>
        </group>
      ))}

      {crates.map((c, i) => (
        <group key={`c${i}`} position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]}>
          <mesh castShadow position={[0, 0.45, 0]}>
            <boxGeometry args={[1.1, 0.9, 1.1]} />
            <meshLambertMaterial color="#a1834f" />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <boxGeometry args={[1, 0.7, 1]} />
            <meshLambertMaterial color="#8d7043" />
          </mesh>
        </group>
      ))}

      {generators.map((g, i) => (
        <group key={`g${i}`} position={[g.x, 0, g.z]}>
          <mesh castShadow position={[0, 0.6, 0]}>
            <boxGeometry args={[1.4, 1.2, 1]} />
            <meshLambertMaterial color="#8b6f3f" />
          </mesh>
          <mesh position={[0, 0.6, 0.55]}>
            <boxGeometry args={[1.1, 0.7, 0.1]} />
            <meshLambertMaterial color="#3f3f46" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
