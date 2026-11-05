import * as THREE from 'three'

/**
 * Shared proportions for every human in the game, so the player and the crowd
 * look like they belong to the same world.
 *
 * All values are in metres, with y measured from the ground under the feet.
 * Torso, neck, head, hair and shoes are boxes centred on `y`. Arms and legs hang
 * from a joint, so their geometry is anchored at the top: `arm.y` is the
 * shoulder and `leg.y` the hip, with the limb extending downwards from there.
 */
export const HUMANOID = {
  totalHeight: 1.74,

  torso: { w: 0.46, h: 0.6, d: 0.28, y: 1.16 },
  /** A short link so the head does not float off the shoulders. */
  neck: { w: 0.13, h: 0.08, d: 0.14, y: 1.5 },
  head: { w: 0.22, h: 0.24, d: 0.22, y: 1.64 },
  hair: { w: 0.25, h: 0.1, d: 0.25, y: 1.76 },

  /** Shoulder joint; the arm swings below it. */
  arm: { w: 0.12, h: 0.54, d: 0.14, y: 1.42, x: 0.315 },
  /** Hip joint; the leg swings below it. */
  leg: { w: 0.16, h: 0.76, d: 0.19, y: 0.86, x: 0.115 },
  /** The shoe resting on the ground at the end of each leg. */
  foot: { w: 0.15, h: 0.08, d: 0.28, y: 0.06 },
}

/**
 * A box anchored at its top, so rotating a mesh about its own origin swings the
 * limb from the joint — a shoulder or a hip — the way a real limb moves.
 */
export function limb(width: number, height: number, depth: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(width, height, depth).translate(0, -height / 2, 0)
}

/**
 * The local position of a foot for a leg swung `tiltX` radians from the hip,
 * in character space (before the character's own yaw). The crowd and the player
 * both use this, so every walk cycle in the city is identical.
 */
export function footLocal(side: number, tiltX: number): { x: number; y: number; z: number } {
  const reach = HUMANOID.leg.h
  return {
    x: HUMANOID.leg.x * side,
    y: HUMANOID.leg.y - reach * Math.cos(tiltX) - HUMANOID.foot.h / 2,
    z: -reach * Math.sin(tiltX),
  }
}

/** Rotates a local offset around the Y axis and returns world x/z. */
export function rotateOffset(
  lx: number,
  lz: number,
  rotationY: number,
): { x: number; z: number } {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos }
}

export function colorToArray(color: string): [number, number, number] {
  const c = new THREE.Color(color)
  return [c.r, c.g, c.b]
}
