import { useEffect, useMemo, useState } from 'react'
import { BUILDING_BY_ID } from '../../data/buildings'
import { BUILDING_PROMPTS } from '../../data/dialogues'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { npcRuntime } from '../../game/npcRuntime'
import { BUSINESS_ACTION_BY_ID, evaluateAction } from '../../systems/business/businessActions'
import { missionForLevel } from '../../systems/progression/progressionEngine'
import { useGameStore, useUnlockedFeatures } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import type { BuildingType } from '../../types/world'
import { Icon } from '../Icon'

/** Business actions that can realistically be carried out at each location. */
const ACTIVITIES: Partial<Record<BuildingType, string[]>> = {
  bank: ['open_bank_account'],
  registration_office: ['register_company', 'complete_registration'],
  business_hub: ['build_pitch_deck', 'hold_board_meeting'],
  office: ['write_business_plan'],
  warehouse: ['stock_inventory', 'arrange_delivery'],
  market: ['write_business_plan'],
}

const NEARBY_RADIUS = 26

/**
 * What the player sees when they walk up to a location: what happens here, and
 * who is standing around right now.
 */
export function BuildingPanel({ buildingId }: { buildingId: string }) {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const cash = useGameStore((s) => s.cash)
  const performBusinessAction = useGameStore((s) => s.performBusinessAction)
  const performedActions = useGameStore((s) => s.performedActions)
  const performedInteractions = useGameStore((s) => s.performedInteractions)
  const collectedInfo = useGameStore((s) => s.collectedInfo)
  const progress = useGameStore((s) => s.progress)
  const unlocks = useUnlockedFeatures()

  const [nearby, setNearby] = useState(() => peopleNear(buildingId))

  useEffect(() => {
    setNearby(peopleNear(buildingId))
    const id = window.setInterval(() => setNearby(peopleNear(buildingId)), 1200)
    return () => window.clearInterval(id)
  }, [buildingId])

  const building = BUILDING_BY_ID[buildingId]

  const missionLink = useMemo(() => {
    const mission = missionForLevel(levelIndex)
    if (!mission || !building) return null
    const objective = mission.objectives.find((o) => {
      if (o.type !== 'visit_building' || o.target !== building.type) return false
      const p = progress.find((x) => x.objectiveId === o.id)
      return !!p && !p.done
    })
    return objective ?? null
  }, [building, levelIndex, progress])

  if (!building) return null

  const prompt = BUILDING_PROMPTS[building.type]
  const activityIds = ACTIVITIES[building.type] ?? []
  const actions = activityIds
    .map((id) => BUSINESS_ACTION_BY_ID[id])
    .filter(Boolean)
    .map((def) => ({
      def,
      availability: evaluateAction(def, {
        levelIndex,
        unlocks,
        performed: performedActions,
        performedInteractions,
        cash,
        requirementInfoCount: collectedInfo.filter((info) => info.kind === 'requirement_info').length,
        researchCounts: collectedInfo.reduce<Record<string, number>>((counts, info) => {
          counts[info.kind] = (counts[info.kind] ?? 0) + 1
          return counts
        }, {}),
      }),
    }))

  function close() {
    useWorldStore.getState().selectBuilding(null)
  }

  async function run(actionId: string, label: string) {
    const result = await performBusinessAction(actionId)
    useWorldStore
      .getState()
      .pushToast(result.ok ? `${label} — done` : result.message, result.ok ? 'success' : 'warning')
  }

  return (
    <div className="panel-backdrop">
      <div className="panel">
        <div className="panel__header">
          <div className="panel__avatar" style={{ background: building.color, color: '#10192a' }}>
            <Icon name="building" size={22} />
          </div>
          <div className="panel__heading">
            <h3 className="panel__title">{building.name}</h3>
            <div className="panel__sub">{prompt?.title ?? building.type.replace(/_/g, ' ')}</div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="Step back">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="panel__body">
          <p className="mission-card__brief" style={{ margin: 0 }}>
            {prompt?.body}
          </p>

          {missionLink && (
            <div className="info-item">
              <div className="info-item__label">Mission objective</div>
              <div className="info-item__detail">{missionLink.text}</div>
            </div>
          )}

          {actions.length > 0 && (
            <>
              <div className="section-title">Activities here</div>
              {actions.map(({ def, availability }) => (
                <button
                  key={def.id}
                  type="button"
                  className="interaction"
                  disabled={!availability.available}
                  onClick={() => run(def.id, def.label)}
                >
                  <span className="interaction__icon">
                    <Icon name="briefcase" size={16} />
                  </span>
                  <span className="interaction__main">
                    <span className="interaction__label">{def.label}</span>
                    <span className="interaction__desc">
                      {availability.available ? def.description : availability.reason}
                    </span>
                  </span>
                  <span className="interaction__meta">
                    {def.cost ? (
                      <span className="interaction__cost">₦{def.cost.toLocaleString()}</span>
                    ) : null}
                    <span className="interaction__xp">+{def.xp} XP</span>
                  </span>
                </button>
              ))}
            </>
          )}

          <div className="section-title">People around here</div>
          {nearby.length === 0 && (
            <div className="empty-state">The street is quiet. Someone will pass by soon.</div>
          )}
          {nearby.map((person) => (
            <div className="record" key={person.id}>
              <span className="record__key" style={{ color: person.accent }}>
                {person.roleLabel}
              </span>
              <span className="record__value">{person.name}</span>
            </div>
          ))}
          {nearby.length > 0 && (
            <div className="info-item">
              <div className="info-item__detail">
                Walk up to a person and press <b>E</b> — or click them — to start a
                conversation.
              </div>
            </div>
          )}
        </div>

        <div className="panel__footer">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Step back
          </button>
        </div>
      </div>
    </div>
  )
}

interface NearbyPerson {
  id: string
  name: string
  roleLabel: string
  accent: string
  dist: number
}

function peopleNear(buildingId: string): NearbyPerson[] {
  const building = BUILDING_BY_ID[buildingId]
  if (!building) return []
  const out: NearbyPerson[] = []
  for (const npc of npcRuntime.npcs) {
    if (npc.state === 'inside') continue
    const d = Math.hypot(
      npc.position[0] - building.position[0],
      npc.position[2] - building.position[2],
    )
    if (d > NEARBY_RADIUS) continue
    const role = ROLE_BY_ID[npc.role]
    out.push({ id: npc.id, name: npc.name, roleLabel: role.label, accent: role.accent, dist: d })
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 8)
}
