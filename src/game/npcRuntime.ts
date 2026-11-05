import type { NPCEntity } from '../types/npc'
import { createRng, type Rng } from '../shared/rng'
import { spawnCityNPCs } from '../systems/npc/npcSpawner'
import { stepNpcSimulation, type SimulationContext } from '../systems/npc/npcSimulation'

/**
 * Holds the live crowd.
 *
 * Deliberately NOT in React state: NPC positions change every frame, and
 * pushing 126 moving entities through a store would re-render the whole tree at
 * 60fps. The renderer reads this object inside `useFrame` and writes straight
 * into instance matrices instead.
 */
class NpcRuntime {
  npcs: NPCEntity[] = []
  private rng: Rng = createRng(20261102)
  private elapsed = 0

  init(seed = 20261102): void {
    this.npcs = spawnCityNPCs(seed)
    this.rng = createRng(seed ^ 0x9e3779b9)
    this.elapsed = 0
  }

  step(dt: number, ctx: SimulationContext): void {
    if (!this.npcs.length) return
    this.elapsed += dt
    stepNpcSimulation(this.npcs, dt, this.rng, ctx)
  }

  byId(id: string): NPCEntity | undefined {
    return this.npcs.find((n) => n.id === id)
  }

  /** NPCs visible on the street (excludes anyone currently inside a building). */
  visible(): NPCEntity[] {
    return this.npcs.filter((n) => n.state !== 'inside')
  }

  get time(): number {
    return this.elapsed
  }
}

export const npcRuntime = new NpcRuntime()
