import { clamp } from '../../shared/math'

/**
 * Orbit camera state, outside React so dragging or zooming never re-renders.
 *
 * The camera sits on a sphere around the player: `yaw` spins it around, `pitch`
 * lifts it up, `distance` pulls it back.
 */
export const cameraState = {
  /** Start behind the player, looking from the city corner toward the centre. */
  yaw: -Math.PI * 0.75,
  pitch: 0.68,
  distance: 18,
}

const MIN_PITCH = 0.2
const MAX_PITCH = 1.18
const MIN_DISTANCE = 8
const MAX_DISTANCE = 34

export function orbit(dx: number, dy: number): void {
  cameraState.yaw -= dx * 0.005
  cameraState.pitch = clamp(cameraState.pitch + dy * 0.004, MIN_PITCH, MAX_PITCH)
}

export function zoom(delta: number): void {
  cameraState.distance = clamp(cameraState.distance + delta * 0.012, MIN_DISTANCE, MAX_DISTANCE)
}

/** Ground-plane direction the camera looks along. W moves this way. */
export function cameraForward(): { x: number; z: number } {
  return { x: -Math.sin(cameraState.yaw), z: -Math.cos(cameraState.yaw) }
}

/** Ground-plane direction to the camera's right. D moves this way. */
export function cameraRight(): { x: number; z: number } {
  return { x: Math.cos(cameraState.yaw), z: -Math.sin(cameraState.yaw) }
}
