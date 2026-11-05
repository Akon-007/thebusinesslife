import type { NPCEntity } from '../../types/npc'
import { PERSONALITY_BEHAVIOUR } from '../../data/dialogues'
import { clamp, damp, lerpAngle } from '../../shared/math'
import { chance, randRange, type Rng } from '../../shared/rng'
import { faceToward, stepNpc } from './npcBrain'

export interface SimulationContext {
  playerPosition: [number, number, number]
  /** NPC ids the player is currently interacting with; they hold still and face the player. */
  frozenIds?: Set<string>
}

const MIN_SEPARATION = 1.05
const MAX_CONVERSATIONS_PER_FRAME = 2

/**
 * Advances the whole crowd for one frame.
 *
 * Order matters: individual brains run first, then social behaviour (NPC-to-NPC
 * chatting), then physical separation so nobody stands inside anybody else.
 */
export function stepNpcSimulation(
  npcs: NPCEntity[],
  dt: number,
  rng: Rng,
  ctx: SimulationContext,
): void {
  const step = clamp(dt, 0, 0.05)
  const frozen = ctx.frozenIds ?? new Set<string>()

  // 1. Run every NPC's own state machine.
  for (const npc of npcs) {
    if (frozen.has(npc.id)) {
      // Interacting with the player: stop and look at them.
      if (npc.state !== 'talking') {
        npc.state = 'talking'
        npc.waitTimer = 2.5
      }
      faceToward(npc, ctx.playerPosition, step, 8)
      continue
    }
    stepNpc(npc, step, rng)
  }

  // 2. Group by district so social checks only consider neighbours.
  const byDistrict = new Map<string, NPCEntity[]>()
  for (const npc of npcs) {
    let bucket = byDistrict.get(npc.districtId)
    if (!bucket) byDistrict.set(npc.districtId, (bucket = []))
    bucket.push(npc)
  }

  // 3. Start NPC-to-NPC conversations.
  let started = 0
  for (const bucket of byDistrict.values()) {
    if (started >= MAX_CONVERSATIONS_PER_FRAME) break
    for (const npc of bucket) {
      if (started >= MAX_CONVERSATIONS_PER_FRAME) break
      if (npc.state !== 'idle' || npc.talkingToId || frozen.has(npc.id)) continue
      const sociability = PERSONALITY_BEHAVIOUR[npc.personality].sociability
      if (!chance(rng, 0.02 * sociability)) continue

      let partner: NPCEntity | null = null
      let bestDist = 4
      for (const other of bucket) {
        if (other.id === npc.id || other.state !== 'idle' || other.talkingToId) continue
        if (frozen.has(other.id)) continue
        const d = Math.hypot(
          other.position[0] - npc.position[0],
          other.position[2] - npc.position[2],
        )
        if (d < bestDist) {
          bestDist = d
          partner = other
        }
      }
      if (!partner) continue

      const duration = randRange(rng, 2.5, 7)
      npc.state = 'talking'
      npc.talkingToId = partner.id
      npc.waitTimer = duration
      partner.state = 'talking'
      partner.talkingToId = npc.id
      partner.waitTimer = duration
      started++
    }
  }

  // 4. Physical separation + face-to-face alignment while talking.
  for (const bucket of byDistrict.values()) {
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i]
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j]
        // Skip the legwork for distant pairs with a cheap bounding check.
        const dx = b.position[0] - a.position[0]
        const dz = b.position[2] - a.position[2]
        const distSq = dx * dx + dz * dz
        if (distSq > 4) continue

        const dist = Math.sqrt(distSq) || 0.0001

        // Two NPCs in a conversation turn to face each other.
        if (a.talkingToId === b.id && b.talkingToId === a.id) {
          a.rotationY = lerpAngle(
            a.rotationY,
            Math.atan2(b.position[0] - a.position[0], b.position[2] - a.position[2]),
            damp(4, step),
          )
          b.rotationY = lerpAngle(
            b.rotationY,
            Math.atan2(a.position[0] - b.position[0], a.position[2] - b.position[2]),
            damp(4, step),
          )
        }

        if (dist >= MIN_SEPARATION) continue

        // Push apart, but never shove an NPC who is mid-conversation with the player.
        const push = (MIN_SEPARATION - dist) * 0.5
        const nx = dx / dist
        const nz = dz / dist
        if (!frozen.has(a.id)) {
          a.position[0] -= nx * push
          a.position[2] -= nz * push
        }
        if (!frozen.has(b.id)) {
          b.position[0] += nx * push
          b.position[2] += nz * push
        }
      }
    }
  }
}
