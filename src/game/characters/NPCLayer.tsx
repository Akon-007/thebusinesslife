import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HUMANOID, footLocal, limb, rotateOffset } from './humanoid'
import { npcRuntime } from '../npcRuntime'
import { playerState } from '../player/playerState'
import { useWorldStore } from '../../state/worldStore'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import type { NPCAccessory } from '../../types/npc'
import { handleNpcClick, canInteractWithNpc } from '../interaction/selection'
import { clamp } from '../../shared/math'

/** How many floating interaction indicators we can show at once. */
const MARKER_POOL = 26
/** NPCs further than this from the player get no indicator. */
const MARKER_RANGE = 16

/**
 * The small props that make one person in the crowd read differently from the
 * next. Every one of them is drawn from the same box, so the whole set costs a
 * single instanced mesh regardless of how many people are wearing something.
 */
const ACCESSORY: Record<
  NPCAccessory,
  { w: number; h: number; d: number; color: string; off: [number, number, number]; onHead: boolean }
> = {
  none: { w: 0, h: 0, d: 0, color: '#000000', off: [0, 0, 0], onHead: false },
  cap: {
    w: 0.24, h: 0.09, d: 0.25, color: '#26405c',
    off: [0, HUMANOID.head.y + HUMANOID.head.h / 2 - 0.01, 0], onHead: true,
  },
  headtie: {
    w: 0.28, h: 0.15, d: 0.28, color: '#c99a2e',
    off: [0, HUMANOID.head.y + HUMANOID.head.h / 2 - 0.02, 0], onHead: true,
  },
  glasses: {
    w: 0.24, h: 0.05, d: 0.05, color: '#141419',
    off: [0, HUMANOID.head.y + 0.02, HUMANOID.head.d / 2 + 0.01], onHead: true,
  },
  bag: {
    w: 0.13, h: 0.24, d: 0.11, color: '#4a3b2a',
    off: [HUMANOID.torso.w / 2 + 0.08, HUMANOID.torso.y - 0.16, 0], onHead: false,
  },
  phone: {
    w: 0.07, h: 0.12, d: 0.03, color: '#101318',
    off: [0.15, HUMANOID.torso.y - 0.04, HUMANOID.torso.d / 2 + 0.02], onHead: false,
  },
}

/** Writes one instance matrix, so every part is placed the same way. */
function place(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  dummy.position.set(px, py, pz)
  dummy.rotation.set(rx, ry, rz)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

/**
 * Renders the whole crowd with instanced meshes and drives the NPC simulation.
 *
 * One instance mesh per body part keeps the crowd cheap, and the simulation is
 * stepped right here in `useFrame` so nothing round-trips through React state at
 * 60fps. Arms and legs are anchored at their joints, so people swing from the
 * hip and shoulder rather than the middle of the limb.
 */
export function NPCLayer() {
  const npcs = npcRuntime.npcs
  const count = npcs.length

  const torsoRef = useRef<THREE.InstancedMesh>(null)
  const neckRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const hairRef = useRef<THREE.InstancedMesh>(null)
  const accessoryRef = useRef<THREE.InstancedMesh>(null)
  const legRef = useRef<THREE.InstancedMesh>(null)
  const armRef = useRef<THREE.InstancedMesh>(null)
  const footRef = useRef<THREE.InstancedMesh>(null)
  const selectedRing = useRef<THREE.Mesh>(null)
  const markerRefs = useRef<(THREE.Mesh | null)[]>([])

  const dummy = useMemo(() => {
    const o = new THREE.Object3D()
    o.rotation.order = 'YXZ'
    return o
  }, [])

  const phases = useMemo(() => new Float32Array(Math.max(count, 1)), [count])
  const scratchColor = useMemo(() => new THREE.Color(), [])

  const geometries = useMemo(
    () => ({
      torso: new THREE.BoxGeometry(HUMANOID.torso.w, HUMANOID.torso.h, HUMANOID.torso.d),
      neck: new THREE.BoxGeometry(HUMANOID.neck.w, HUMANOID.neck.h, HUMANOID.neck.d),
      head: new THREE.BoxGeometry(HUMANOID.head.w, HUMANOID.head.h, HUMANOID.head.d),
      hair: new THREE.BoxGeometry(HUMANOID.hair.w, HUMANOID.hair.h, HUMANOID.hair.d),
      accessory: new THREE.BoxGeometry(1, 1, 1),
      leg: limb(HUMANOID.leg.w, HUMANOID.leg.h, HUMANOID.leg.d),
      arm: limb(HUMANOID.arm.w, HUMANOID.arm.h, HUMANOID.arm.d),
      foot: new THREE.BoxGeometry(HUMANOID.foot.w, HUMANOID.foot.h, HUMANOID.foot.d),
    }),
    [],
  )

  const materials = useMemo(
    () => ({
      skin: new THREE.MeshLambertMaterial(),
      hair: new THREE.MeshLambertMaterial(),
      shirt: new THREE.MeshLambertMaterial(),
      trousers: new THREE.MeshLambertMaterial(),
      shoe: new THREE.MeshLambertMaterial(),
      accessory: new THREE.MeshLambertMaterial(),
    }),
    [],
  )

  // Per-instance colours are static, so set them once.
  useLayoutEffect(() => {
    const torso = torsoRef.current
    const neck = neckRef.current
    const head = headRef.current
    const hair = hairRef.current
    const accessory = accessoryRef.current
    const legs = legRef.current
    const arms = armRef.current
    const feet = footRef.current
    if (!torso || !neck || !head || !hair || !accessory || !legs || !arms || !feet) return

    for (let i = 0; i < count; i++) {
      const npc = npcs[i]
      const { shirt, skin, hair: hairColor, trousers, accessory: prop } = npc.appearance
      const shoe = new THREE.Color(trousers).multiplyScalar(0.55)

      torso.setColorAt(i, scratchColor.set(shirt))
      neck.setColorAt(i, scratchColor.set(skin))
      head.setColorAt(i, scratchColor.set(skin))
      hair.setColorAt(i, scratchColor.set(hairColor))
      accessory.setColorAt(i, scratchColor.set(ACCESSORY[prop].color))

      legs.setColorAt(i * 2, scratchColor.set(trousers))
      legs.setColorAt(i * 2 + 1, scratchColor.set(trousers))
      arms.setColorAt(i * 2, scratchColor.set(shirt))
      arms.setColorAt(i * 2 + 1, scratchColor.set(shirt))
      feet.setColorAt(i * 2, shoe)
      feet.setColorAt(i * 2 + 1, shoe)
    }

    for (const mesh of [torso, neck, head, hair, accessory, legs, arms, feet]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [count, npcs, scratchColor])

  useFrame((_, rawDelta) => {
    const dt = clamp(rawDelta, 0, 0.05)
    const world = useWorldStore.getState()
    const playerPos: [number, number, number] = [playerState.x, 0, playerState.z]

    // --- drive the simulation ---
    const frozen = new Set<string>()
    if (world.activeNpcId) frozen.add(world.activeNpcId)
    npcRuntime.step(dt, { playerPosition: playerPos, frozenIds: frozen })

    // --- write instance matrices ---
    const torso = torsoRef.current
    const neck = neckRef.current
    const head = headRef.current
    const hair = hairRef.current
    const accessory = accessoryRef.current
    const legs = legRef.current
    const arms = armRef.current
    const feet = footRef.current
    if (!torso || !neck || !head || !hair || !accessory || !legs || !arms || !feet) return

    const time = npcRuntime.time

    for (let i = 0; i < count; i++) {
      const npc = npcs[i]
      const hidden = npc.state === 'inside'
      const scale = hidden ? 0 : npc.appearance.heightScale

      const walking = npc.state === 'walking' || npc.state === 'entering' || npc.state === 'leaving'
      if (walking) phases[i] += dt * npc.speed * 2.4
      const phase = phases[i]

      const x = npc.position[0]
      const z = npc.position[2]
      const yaw = npc.rotationY

      // Everyone breathes; walkers bob and lean; talkers nod along.
      const talking = npc.state === 'talking'
      const bob = walking
        ? Math.abs(Math.sin(phase)) * 0.03
        : Math.sin(time * 1.5 + i * 1.7) * 0.012 + (talking ? Math.sin(time * 4 + i) * 0.02 : 0)
      const lean = walking ? 0.06 : 0
      const roll = walking ? Math.sin(phase) * 0.035 : Math.cos(time * 1.1 + i) * 0.015

      // Idle people glance around; walkers keep their eyes on where they are going.
      const headYaw = yaw + (walking ? 0 : Math.sin(time * 0.6 + i * 2.1) * 0.3)

      place(dummy, torso, i, x, (HUMANOID.torso.y + bob) * scale, z, lean, yaw, roll, scale, scale, scale)
      place(dummy, neck, i, x, (HUMANOID.neck.y + bob) * scale, z, 0, headYaw, roll, scale, scale, scale)
      place(dummy, head, i, x, (HUMANOID.head.y + bob) * scale, z, 0, headYaw, roll * 0.6, scale, scale, scale)
      place(dummy, hair, i, x, (HUMANOID.hair.y + bob) * scale, z, 0, headYaw, roll * 0.6, scale, scale, scale)

      const prop = ACCESSORY[npc.appearance.accessory]
      const propYaw = prop.onHead ? headYaw : yaw
      const propOffset = rotateOffset(prop.off[0], prop.off[2], propYaw)
      place(
        dummy, accessory, i,
        x + propOffset.x * scale,
        (prop.off[1] + bob) * scale,
        z + propOffset.z * scale,
        0, propYaw, 0,
        prop.w * scale, prop.h * scale, prop.d * scale,
      )

      // Legs and arms swing in opposition, hinged at hip and shoulder.
      const amp = walking ? 0.55 : 0
      const swing = Math.sin(phase) * amp

      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1
        const index = i * 2 + s
        const legTilt = swing * side

        const legOffset = rotateOffset(HUMANOID.leg.x * side, 0, yaw)
        place(
          dummy, legs, index,
          x + legOffset.x * scale, HUMANOID.leg.y * scale, z + legOffset.z * scale,
          legTilt, yaw, 0, scale, scale, scale,
        )

        const foot = footLocal(side, legTilt)
        const footOffset = rotateOffset(foot.x, foot.z, yaw)
        place(
          dummy, feet, index,
          x + footOffset.x * scale, foot.y * scale, z + footOffset.z * scale,
          0, yaw, 0, scale, scale, scale,
        )

        const armOffset = rotateOffset(HUMANOID.arm.x * side, 0, yaw)
        place(
          dummy, arms, index,
          x + armOffset.x * scale, HUMANOID.arm.y * scale, z + armOffset.z * scale,
          -swing * side * 0.85, yaw, 0, scale, scale, scale,
        )
      }
    }

    torso.instanceMatrix.needsUpdate = true
    neck.instanceMatrix.needsUpdate = true
    head.instanceMatrix.needsUpdate = true
    hair.instanceMatrix.needsUpdate = true
    accessory.instanceMatrix.needsUpdate = true
    legs.instanceMatrix.needsUpdate = true
    arms.instanceMatrix.needsUpdate = true
    feet.instanceMatrix.needsUpdate = true

    // --- interaction indicators for the closest interactable NPCs ---
    const candidates: { npc: (typeof npcs)[number]; dist: number }[] = []
    for (const npc of npcs) {
      if (npc.state === 'inside') continue
      const d = Math.hypot(npc.position[0] - playerPos[0], npc.position[2] - playerPos[2])
      if (d <= MARKER_RANGE) candidates.push({ npc, dist: d })
    }
    candidates.sort((a, b) => a.dist - b.dist)

    for (let m = 0; m < MARKER_POOL; m++) {
      const mesh = markerRefs.current[m]
      if (!mesh) continue
      const entry = candidates[m]
      if (!entry) {
        mesh.visible = false
        continue
      }
      const inRange = canInteractWithNpc(entry.npc)
      const lift = 2.05 + Math.sin(time * 2.6 + m) * 0.08
      mesh.visible = true
      mesh.position.set(entry.npc.position[0], lift, entry.npc.position[2])
      mesh.rotation.y = time * 1.1 + m
      const material = mesh.material as THREE.MeshBasicMaterial
      material.color.set(ROLE_BY_ID[entry.npc.role].accent)
      material.opacity = inRange ? 0.85 : 0.28
      mesh.scale.setScalar(inRange ? 1 : 0.7)
    }

    // --- highlight ring under the selected NPC ---
    const ring = selectedRing.current
    if (ring) {
      const active = world.activeNpcId ? npcRuntime.byId(world.activeNpcId) : null
      if (active) {
        ring.visible = true
        ring.position.set(active.position[0], 0.03, active.position[2])
        const pulse = 1 + Math.sin(time * 4) * 0.06
        ring.scale.setScalar(pulse)
        const material = ring.material as THREE.MeshBasicMaterial
        material.color.set(ROLE_BY_ID[active.role].accent)
      } else {
        ring.visible = false
      }
    }
  })

  function onNpcPointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.instanceId === undefined) return
    const npc = npcs[event.instanceId]
    if (!npc) return
    event.stopPropagation()
    handleNpcClick(npc.id)
  }

  function onPointerOver(event: ThreeEvent<PointerEvent>) {
    if (event.instanceId === undefined) return
    const npc = npcs[event.instanceId]
    if (!npc || !canInteractWithNpc(npc)) return
    event.stopPropagation()
    document.body.style.cursor = 'pointer'
  }

  function onPointerOut() {
    document.body.style.cursor = 'default'
  }

  return (
    <group>
      <instancedMesh
        ref={torsoRef}
        args={[geometries.torso, materials.shirt, count]}
        frustumCulled={false}
        onPointerDown={onNpcPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      />
      <instancedMesh
        ref={neckRef}
        args={[geometries.neck, materials.skin, count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={headRef}
        args={[geometries.head, materials.skin, count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={hairRef}
        args={[geometries.hair, materials.hair, count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={accessoryRef}
        args={[geometries.accessory, materials.accessory, count]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={legRef}
        args={[geometries.leg, materials.trousers, count * 2]}
        frustumCulled={false}
        onPointerDown={onNpcPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      />
      <instancedMesh
        ref={armRef}
        args={[geometries.arm, materials.shirt, count * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={footRef}
        args={[geometries.foot, materials.shoe, count * 2]}
        frustumCulled={false}
      />

      {/* interaction indicators */}
      {Array.from({ length: MARKER_POOL }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            markerRefs.current[i] = el
          }}
          visible={false}
        >
          <octahedronGeometry args={[0.17, 0]} />
          <meshBasicMaterial transparent opacity={0.8} />
        </mesh>
      ))}

      {/* selected NPC highlight */}
      <mesh ref={selectedRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.6, 0.78, 28]} />
        <meshBasicMaterial transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
