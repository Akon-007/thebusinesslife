import type { CollectedInfo } from '../../types/business'
import type { NPCEntity } from '../../types/npc'
import type { InteractionDef } from '../../data/npcCatalog'
import { PITCH_OUTCOMES } from '../../data/dialogues'

export interface InteractionOutcome {
  /** What the NPC says back. */
  response: string
  /** Information added to the player's records, if any. */
  info?: CollectedInfo
  /** Business action fired, if any. */
  action?: string
  xp: number
  cashDelta: number
  reputationDelta: number
  /** Extra flavour appended to the panel, e.g. a rejection note. */
  sentiment?: 'positive' | 'neutral' | 'negative'
}

function bandForReputation(reputation: number): keyof typeof PITCH_OUTCOMES {
  if (reputation >= 45) return 'committed'
  if (reputation >= 25) return 'interested'
  if (reputation >= 12) return 'lukewarm'
  return 'rejected'
}

function randomOf(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

/**
 * Turns a chosen interaction into concrete effects on game state.
 *
 * Everything an NPC interaction can change flows through here, so the
 * renderer never has to know a single rule.
 */
export function resolveInteraction(args: {
  npc: NPCEntity
  interaction: InteractionDef
  reputation: number
  now: number
  infoId: string
}): InteractionOutcome {
  const { npc, interaction, reputation, now, infoId } = args

  // Pitching is the one interaction whose outcome depends on how far the
  // player has come: a stronger reputation unlocks a better reception.
  if (interaction.id === 'pitch') {
    const band = bandForReputation(reputation)
    const sentiment: InteractionOutcome['sentiment'] =
      band === 'committed' || band === 'interested'
        ? 'positive'
        : band === 'lukewarm'
          ? 'neutral'
          : 'negative'
    return {
      response: randomOf(PITCH_OUTCOMES[band]),
      info: {
        id: infoId,
        kind: 'investment_interest',
        label: `Pitch outcome (${band})`,
        detail: `Investor reaction: ${band}.`,
        sourceNpcId: npc.id,
        sourceNpcName: npc.name,
        sourceRole: npc.role,
        collectedAt: now,
      },
      xp: interaction.xp ?? 30,
      cashDelta: 0,
      reputationDelta: sentiment === 'positive' ? 3 : 1,
      sentiment,
    }
  }

  const outcome: InteractionOutcome = {
    response: interaction.response,
    xp: interaction.xp ?? 6,
    cashDelta: interaction.cash ?? 0,
    reputationDelta: 0,
    sentiment: 'neutral',
  }

  if (interaction.info) {
    outcome.info = {
      id: infoId,
      kind: interaction.info.kind,
      label: interaction.info.label,
      detail: interaction.info.detail,
      value: interaction.info.value,
      sourceNpcId: npc.id,
      sourceNpcName: npc.name,
      sourceRole: npc.role,
      collectedAt: now,
    }
  }

  if (interaction.action) outcome.action = interaction.action

  return outcome
}
