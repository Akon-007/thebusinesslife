/**
 * Mutable player state shared between the movement system, the camera and the
 * NPC crowd. Kept outside React for the same reason as the NPC runtime: it
 * changes every frame and must not trigger re-renders.
 */
export interface PlayerMutableState {
  x: number
  z: number
  /** Facing angle in radians. */
  rotationY: number
  /** Horizontal speed this frame, used to drive the walk animation. */
  speed: number
  /** Accumulated animation phase. */
  walkPhase: number
  moving: boolean
}

export const playerState: PlayerMutableState = {
  x: -110,
  z: -110,
  rotationY: 0,
  speed: 0,
  walkPhase: 0,
  moving: false,
}

export const PLAYER_SPAWN: [number, number, number] = [-110, 0, -110]
