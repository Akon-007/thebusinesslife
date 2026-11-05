import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HUMANOID, footLocal, limb } from './humanoid'
import { playerState } from '../player/playerState'
import { useGameStore } from '../../state/gameStore'

const PLAYER_COLORS = {
  shirt: '#facc15',
  trousers: '#1f2937',
  skin: '#8d5524',
  hair: '#1c1410',
  shoe: '#0f172a',
}

/**
 * The player's avatar: built from the same shared body plan as the crowd, with
 * a swinging walk cycle, a floating name tag and a ground ring that makes them
 * easy to follow.
 */
export function PlayerCharacter() {
  const group = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Mesh>(null)
  const neck = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const leftLeg = useRef<THREE.Mesh>(null)
  const rightLeg = useRef<THREE.Mesh>(null)
  const leftFoot = useRef<THREE.Mesh>(null)
  const rightFoot = useRef<THREE.Mesh>(null)

  // Limbs are anchored at the joint so they swing from hip and shoulder.
  const armGeo = useMemo(() => limb(HUMANOID.arm.w, HUMANOID.arm.h, HUMANOID.arm.d), [])
  const legGeo = useMemo(() => limb(HUMANOID.leg.w, HUMANOID.leg.h, HUMANOID.leg.d), [])

  const playerName = useGameStore((s) => s.playerName)
  const businessName = useGameStore((s) => s.businessName)

  useFrame(() => {
    const g = group.current
    if (!g) return

    g.position.set(playerState.x, 0, playerState.z)
    g.rotation.y = playerState.rotationY

    // Walk cycle: full swing while moving, a gentle idle sway when standing.
    const walking = playerState.speed > 0.1
    const amp = walking ? 0.62 : 0.05
    const phase = playerState.walkPhase
    const swing = Math.sin(phase) * amp

    if (leftLeg.current) leftLeg.current.rotation.x = swing
    if (rightLeg.current) rightLeg.current.rotation.x = -swing
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.85
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.85

    const bob = walking ? Math.abs(Math.sin(phase)) * 0.03 : 0
    if (torso.current) {
      torso.current.position.y = HUMANOID.torso.y + bob
      torso.current.rotation.x = walking ? 0.06 : 0
      torso.current.rotation.z = walking ? Math.sin(phase) * 0.035 : 0
    }
    if (neck.current) neck.current.position.y = HUMANOID.neck.y + bob
    if (head.current) head.current.position.y = HUMANOID.head.y + bob

    const lf = footLocal(-1, swing)
    const rf = footLocal(1, -swing)
    if (leftFoot.current) leftFoot.current.position.set(lf.x, lf.y, lf.z)
    if (rightFoot.current) rightFoot.current.position.set(rf.x, rf.y, rf.z)
  })

  return (
    <group ref={group}>
      {/* ground ring so the player is always findable in the crowd */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.45, 0.6, 24]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={torso} castShadow position={[0, HUMANOID.torso.y, 0]}>
        <boxGeometry args={[HUMANOID.torso.w, HUMANOID.torso.h, HUMANOID.torso.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.shirt} />
      </mesh>

      <mesh ref={neck} castShadow position={[0, HUMANOID.neck.y, 0]}>
        <boxGeometry args={[HUMANOID.neck.w, HUMANOID.neck.h, HUMANOID.neck.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.skin} />
      </mesh>

      <mesh ref={head} castShadow position={[0, HUMANOID.head.y, 0]}>
        <boxGeometry args={[HUMANOID.head.w, HUMANOID.head.h, HUMANOID.head.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.skin} />
      </mesh>

      <mesh position={[0, HUMANOID.hair.y, 0]}>
        <boxGeometry args={[HUMANOID.hair.w, HUMANOID.hair.h, HUMANOID.hair.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.hair} />
      </mesh>

      <mesh
        ref={leftArm}
        castShadow
        geometry={armGeo}
        position={[-HUMANOID.arm.x, HUMANOID.arm.y, 0]}
      >
        <meshLambertMaterial color={PLAYER_COLORS.shirt} />
      </mesh>
      <mesh
        ref={rightArm}
        castShadow
        geometry={armGeo}
        position={[HUMANOID.arm.x, HUMANOID.arm.y, 0]}
      >
        <meshLambertMaterial color={PLAYER_COLORS.shirt} />
      </mesh>

      <mesh
        ref={leftLeg}
        castShadow
        geometry={legGeo}
        position={[-HUMANOID.leg.x, HUMANOID.leg.y, 0]}
      >
        <meshLambertMaterial color={PLAYER_COLORS.trousers} />
      </mesh>
      <mesh
        ref={rightLeg}
        castShadow
        geometry={legGeo}
        position={[HUMANOID.leg.x, HUMANOID.leg.y, 0]}
      >
        <meshLambertMaterial color={PLAYER_COLORS.trousers} />
      </mesh>

      <mesh ref={leftFoot} castShadow position={[-HUMANOID.leg.x, HUMANOID.foot.y, 0]}>
        <boxGeometry args={[HUMANOID.foot.w, HUMANOID.foot.h, HUMANOID.foot.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.shoe} />
      </mesh>
      <mesh ref={rightFoot} castShadow position={[HUMANOID.leg.x, HUMANOID.foot.y, 0]}>
        <boxGeometry args={[HUMANOID.foot.w, HUMANOID.foot.h, HUMANOID.foot.d]} />
        <meshLambertMaterial color={PLAYER_COLORS.shoe} />
      </mesh>

      <Html position={[0, 2.15, 0]} center distanceFactor={16} zIndexRange={[5, 0]}>
        <div className="nameplate nameplate--player">
          <span className="nameplate__name">{playerName}</span>
          <span className="nameplate__sub">{businessName}</span>
        </div>
      </Html>
    </group>
  )
}
