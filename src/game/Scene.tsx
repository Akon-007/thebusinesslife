import { City } from './city/City'
import { NPCLayer } from './characters/NPCLayer'
import { PlayerCharacter } from './characters/PlayerCharacter'
import { PlayerController } from './player/PlayerController'
import { ThirdPersonCamera } from './camera/ThirdPersonCamera'

/**
 * The gameplay world. Everything here is either the city itself or something
 * that moves inside it; the HUD is drawn as DOM on top of the canvas.
 */
export function Scene() {
  return (
    <>
      <color attach="background" args={['#a8c8ea']} />
      <fog attach="fog" args={['#bcd6ef', 110, 340]} />

      {/* Lagos afternoon: strong sky bounce, warm ground bounce, one hard sun */}
      <hemisphereLight args={['#dceaff', '#6f6450', 0.9]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow
        position={[90, 140, 70]}
        intensity={1.05}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={420}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={170}
        shadow-camera-bottom={-170}
        shadow-bias={-0.0006}
      />

      <City />
      <NPCLayer />
      <PlayerCharacter />

      <PlayerController />
      <ThirdPersonCamera />
    </>
  )
}
