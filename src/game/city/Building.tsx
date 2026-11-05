import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Building as BuildingData } from '../../types/world'
import { DISTRICT_BY_ID } from '../../data/buildings'
import { makeFacadeTexture, makeSignTexture } from './textures'
import { handleBuildingClick } from '../interaction/selection'
import { useWorldStore } from '../../state/worldStore'

const SIGN_BG = '#141b28'
const SIGN_FG = '#ffd166'
/** 512 x 96, the size the sign canvas is painted at. */
const SIGN_ASPECT = 0.1875

/**
 * One interactive location in the city.
 *
 * The facade texture is cloned per building so every block tiles its windows to
 * its own footprint, and the painted shop sign always faces the street the
 * district hub sits on, which is where the player approaches from.
 */
export function Building({ building }: { building: BuildingData }) {
  const selected = useWorldStore((s) => s.activeBuildingId === building.id)

  const { facade, signTex, front } = useMemo(() => {
    const district = DISTRICT_BY_ID[building.districtId]
    // The street front is the direction of the district hub the entrance sits on.
    let nx = district.center[0] - building.position[0]
    let nz = district.center[1] - building.position[2]
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len

    const facadeTex = makeFacadeTexture().clone()
    facadeTex.needsUpdate = true
    facadeTex.repeat.set(
      Math.max(1, Math.round(building.size[0] / 4.5)),
      Math.max(1, Math.round(building.size[1] / 3.5)),
    )

    return {
      facade: facadeTex,
      signTex: makeSignTexture(building.sign, SIGN_BG, SIGN_FG),
      front: { nx, nz, yaw: Math.atan2(nx, nz) },
    }
  }, [building])

  const [w, h, d] = building.size
  // How far the box surface sits from its centre along the street direction.
  const support = (w / 2) * Math.abs(front.nx) + (d / 2) * Math.abs(front.nz)
  const signW = Math.min(w, d) * 0.86
  const signY = Math.max(3.2, h * 0.68)

  function onPointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation()
    handleBuildingClick(building.id)
  }

  function onPointerOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation()
    document.body.style.cursor = 'pointer'
  }

  function onPointerOut() {
    document.body.style.cursor = 'default'
  }

  return (
    <group
      position={[building.position[0], 0, building.position[2]]}
      rotation={[0, building.rotationY, 0]}
    >
      <mesh
        castShadow
        receiveShadow
        position={[0, h / 2, 0]}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <boxGeometry args={[w, h, d]} />
        <meshLambertMaterial color={building.color} map={facade} />
      </mesh>

      {/* flat roof cap with a slight overhang */}
      <mesh castShadow position={[0, h + 0.35, 0]}>
        <boxGeometry args={[w + 0.7, 0.7, d + 0.7]} />
        <meshLambertMaterial color={building.roofColor} />
      </mesh>

      {/* painted shop sign facing the street */}
      <mesh
        position={[
          front.nx * (support + 0.12),
          signY,
          front.nz * (support + 0.12),
        ]}
        rotation={[0, front.yaw, 0]}
      >
        <planeGeometry args={[signW, signW * SIGN_ASPECT]} />
        <meshBasicMaterial map={signTex} transparent toneMapped={false} />
      </mesh>

      {/* selection effects: an outline plus a marker on the pavement */}
      {selected && (
        <>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w + 0.5, h + 0.5, d + 0.5]} />
            <meshBasicMaterial
              color={SIGN_FG}
              wireframe
              transparent
              opacity={0.5}
              toneMapped={false}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[
              front.nx * (support + 1.7),
              0.05,
              front.nz * (support + 1.7),
            ]}
          >
            <ringGeometry args={[1.15, 1.5, 32]} />
            <meshBasicMaterial
              color={SIGN_FG}
              transparent
              opacity={0.7}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
    </group>
  )
}
