import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { clamp, damp, lerpAngle } from '../../shared/math'
import { useWorldStore } from '../../state/worldStore'
import { installKeyboard, isDown } from '../input/keyboard'
import { cameraForward, cameraRight } from '../camera/cameraState'
import { resolvePlayerPosition } from '../world/collision'
import { updateBuildingVisits } from '../world/buildingVisits'
import { playerState } from './playerState'

const WALK_SPEED = 7
const SPRINT_SPEED = 11.5

/**
 * Moves the player around the city.
 *
 * Writing straight into `playerState` instead of React state keeps the crowd and
 * the camera in sync inside a single frame with zero re-renders.
 */
export function PlayerController() {
  useEffect(() => installKeyboard(), [])

  useFrame((_, rawDelta) => {
    const dt = clamp(rawDelta, 0, 0.05)

    // While a panel, a conversation or a full-screen overlay is up, hold still.
    const world = useWorldStore.getState()
    const busy = world.panel !== 'none' || world.activeNpcId !== null || world.overlayOpen

    let forward = 0
    let strafe = 0
    if (!busy) {
      if (isDown('w') || isDown('arrowup')) forward += 1
      if (isDown('s') || isDown('arrowdown')) forward -= 1
      if (isDown('d') || isDown('arrowright')) strafe += 1
      if (isDown('a') || isDown('arrowleft')) strafe -= 1
    }

    const f = cameraForward()
    const r = cameraRight()
    let dx = f.x * forward + r.x * strafe
    let dz = f.z * forward + r.z * strafe
    const length = Math.hypot(dx, dz)

    playerState.walkPhase += dt * (length > 0.001 ? 9 : 1.5)

    if (length > 0.001) {
      dx /= length
      dz /= length
      const speed = isDown('shift') ? SPRINT_SPEED : WALK_SPEED
      playerState.rotationY = lerpAngle(playerState.rotationY, Math.atan2(dx, dz), damp(14, dt))
      const moved = resolvePlayerPosition(
        playerState.x + dx * speed * dt,
        playerState.z + dz * speed * dt,
      )
      playerState.x = moved.x
      playerState.z = moved.z
      playerState.speed = speed
      playerState.moving = true
    } else {
      playerState.speed = 0
      playerState.moving = false
    }

    updateBuildingVisits(dt)
  })

  return null
}
