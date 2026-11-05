import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { useWorldStore } from '../state/worldStore'

/**
 * The WebGL root. `flat` keeps the low-poly colours bright instead of letting
 * filmic tone mapping wash them out, which suits the stylised city look.
 */
export function GameCanvas() {
  return (
    <Canvas
      shadows
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 52, near: 0.5, far: 640, position: [0, 24, 24] }}
      onPointerMissed={() => {
        const world = useWorldStore.getState()
        if (world.activeNpcId) world.selectNpc(null)
        if (world.activeBuildingId) world.selectBuilding(null)
      }}
    >
      <Scene />
    </Canvas>
  )
}
