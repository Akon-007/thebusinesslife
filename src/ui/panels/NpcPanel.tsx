import { useEffect, useMemo, useState } from 'react'
import { isInteractionAvailable, ROLE_BY_ID, type InteractionDef } from '../../data/npcCatalog'
import { GREETINGS, PERSONALITY_MODIFIERS } from '../../data/dialogues'
import { npcRuntime } from '../../game/npcRuntime'
import { resolveInteraction } from '../../systems/interaction/interactionResolver'
import { useGameStore, useUnlockedFeatures } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { DISTRICT_BY_ID } from '../../data/buildings'
import { Icon, type IconName } from '../Icon'

/** Picks a sensible icon for an interaction from its id. */
function iconFor(id: string): IconName {
  if (/price|quote|negotiate|compare|sample|premises/.test(id)) return 'tag'
  if (/pitch|invest|meeting|present|introduce|company|advice|idea|bookkeeping/.test(id)) {
    return 'handshake'
  }
  if (/register|compliance|requirement|permit|loan|collateral|account/.test(id)) return 'building'
  if (/employ|qualification|responsibilit|candidate|team|assign/.test(id)) return 'people'
  if (/delivery|logistics|service/.test(id)) return 'briefcase'
  return 'target'
}

/**
 * The contextual NPC conversation panel.
 *
 * Only the interactions that belong to this person's role are ever offered —
 * a customer is never asked about loan terms, and a bank representative is
 * never asked to buy a product.
 */
export function NpcPanel({ npcId }: { npcId: string }) {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const cash = useGameStore((s) => s.cash)
  const reputation = useGameStore((s) => s.reputation)
  const applyNpcInteraction = useGameStore((s) => s.applyNpcInteraction)
  const unlocks = useUnlockedFeatures()

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [line, setLine] = useState<{ who: 'npc' | 'player'; text: string } | null>(null)

  const npc = npcRuntime.byId(npcId)

  // Reset the conversation whenever a different person is selected.
  useEffect(() => {
    setCounts({ ...(npcRuntime.byId(npcId)?.interacted ?? {}) })
    setLine(null)
  }, [npcId])

  const greeting = useMemo(() => {
    const live = npcRuntime.byId(npcId)
    if (!live) return ''
    const lines = GREETINGS[live.role]
    return lines[Math.floor(Math.random() * lines.length)]
  }, [npcId])

  if (!npc) return null

  const role = ROLE_BY_ID[npc.role]
  const district = DISTRICT_BY_ID[npc.districtId]

  const available = role.interactions.filter((def) =>
    isInteractionAvailable(def, { levelIndex, unlocks }),
  )

  function close() {
    useWorldStore.getState().selectNpc(null)
  }

  function perform(def: InteractionDef) {
    const live = npcRuntime.byId(npcId)
    if (!live) return

    const outcome = resolveInteraction({
      npc: live,
      interaction: def,
      reputation,
      now: Date.now(),
      infoId: 'pending',
    })

    const result = applyNpcInteraction({
      npcId: live.id,
      npcRole: live.role,
      interactionId: def.id,
      info: outcome.info
        ? {
            kind: outcome.info.kind,
            label: outcome.info.label,
            detail: outcome.info.detail,
            value: outcome.info.value,
            sourceNpcId: live.id,
            sourceNpcName: live.name,
            sourceRole: live.role,
            collectedAt: Date.now(),
          }
        : undefined,
      action: outcome.action,
      xp: outcome.xp,
      cashDelta: outcome.cashDelta,
      cost: def.cost,
      reputationDelta: outcome.reputationDelta,
    })

    if (!result.ok) {
      useWorldStore.getState().pushToast(result.message, 'warning')
      return
    }

    setLine({ who: 'npc', text: outcome.response })
    setCounts((current) => ({ ...current, [def.id]: (current[def.id] ?? 0) + 1 }))

    if (def.cost) {
      useWorldStore.getState().pushToast(`Paid ₦${def.cost.toLocaleString()} — ${def.label}`, 'info')
    }
    if (outcome.cashDelta > 0) {
      useWorldStore.getState().pushToast(`Received ₦${outcome.cashDelta.toLocaleString()}`, 'success')
    }
  }

  return (
    <div className="panel-backdrop">
      <div className="panel">
        <div className="panel__header">
          <div className="panel__avatar" style={{ background: role.accent }}>
            {npc.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="panel__heading">
            <h3 className="panel__title">{npc.name}</h3>
            <div className="panel__sub">
              {role.label}
              {district ? ` · ${district.name}` : ''}
            </div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="End conversation">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="panel__body">
          <div className="chip-row">
            <span className="chip">{npc.personality}</span>
            <span className="chip">{PERSONALITY_MODIFIERS[npc.personality]}</span>
            <span className="chip">{role.blurb}</span>
          </div>

          <div className="dialogue">
            <div className="dialogue__face" style={{ background: role.accent }}>
              {npc.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="dialogue__bubble">{line ? line.text : greeting}</div>
          </div>

          <div className="section-title">What do you do?</div>

          {available.map((def) => {
            const times = counts[def.id] ?? 0
            const tooExpensive = !!def.cost && cash < def.cost
            return (
              <button
                key={def.id}
                type="button"
                className="interaction"
                disabled={tooExpensive}
                onClick={() => perform(def)}
                title={tooExpensive ? 'Not enough cash' : def.description}
              >
                <span className="interaction__icon">
                  <Icon name={iconFor(def.id)} size={16} />
                </span>
                <span className="interaction__main">
                  <span className="interaction__label">{def.label}</span>
                  <span className="interaction__desc">{def.description}</span>
                </span>
                <span className="interaction__meta">
                  {def.cost ? (
                    <span className="interaction__cost">₦{def.cost.toLocaleString()}</span>
                  ) : null}
                  {def.cash ? (
                    <span className="interaction__xp">+₦{def.cash.toLocaleString()}</span>
                  ) : null}
                  <span className="interaction__xp">+{def.xp ?? 6} XP</span>
                  {def.info && <span className="chip">{def.info.label}</span>}
                  {times > 0 && <span className="interaction__done">done ×{times}</span>}
                </span>
              </button>
            )
          })}

          {available.length === 0 && (
            <div className="empty-state">Nothing to discuss with them yet.</div>
          )}
        </div>

        <div className="panel__footer">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Walk away
          </button>
        </div>
      </div>
    </div>
  )
}
