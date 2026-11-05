import { useEffect, useMemo, useState } from 'react'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { BUSINESS_ACTIONS, evaluateAction, type BusinessActionDef } from '../../systems/business/businessActions'
import { useGameStore, useUnlockedFeatures } from '../../state/gameStore'
import { useFinanceStore } from '../../state/financeStore'
import { useWorldStore } from '../../state/worldStore'
import type { BusinessRecordKey } from '../../types/business'
import { Icon } from '../Icon'
import { FinanceView } from './business/FinanceView'
import { OrdersView } from './business/OrdersView'

type Tab = 'overview' | 'actions' | 'finance' | 'orders' | 'team'

const CATEGORY_ORDER: BusinessActionDef['category'][] = [
  'planning',
  'legal',
  'operations',
  'finance',
  'growth',
]

const CATEGORY_LABEL: Record<BusinessActionDef['category'], string> = {
  planning: 'Planning',
  legal: 'Legal & registration',
  operations: 'Operations',
  finance: 'Finance',
  growth: 'Growth',
}

/** Display order and labels for the business log. */
const RECORD_ROWS: { key: BusinessRecordKey; label: string }[] = [
  { key: 'idea', label: 'The idea' },
  { key: 'problem', label: 'Problem solved' },
  { key: 'targetMarket', label: 'Target market' },
  { key: 'valueProposition', label: 'Value proposition' },
  { key: 'businessPlan', label: 'Business plan' },
  { key: 'companyName', label: 'Company' },
  { key: 'registrationNumber', label: 'Registration no.' },
  { key: 'productName', label: 'Product' },
  { key: 'pitchDeck', label: 'Pitch deck' },
  { key: 'fundingAsk', label: 'Funding' },
]

/**
 * The business back-office, opened from the HUD rather than from a building so
 * the player can always check the books, run a business action, or review the
 * team without losing their place in the city.
 */
export function BusinessPanel() {
  const businessName = useGameStore((s) => s.businessName)
  const cash = useGameStore((s) => s.cash)
  const reputation = useGameStore((s) => s.reputation)
  const levelIndex = useGameStore((s) => s.levelIndex)
  const records = useGameStore((s) => s.records)
  const team = useGameStore((s) => s.team)
  const stockUnits = useGameStore((s) => s.stockUnits)
  const collectedInfo = useGameStore((s) => s.collectedInfo)
  const performedActions = useGameStore((s) => s.performedActions)
  const performedInteractions = useGameStore((s) => s.performedInteractions)
  const performBusinessAction = useGameStore((s) => s.performBusinessAction)
  const unlocks = useUnlockedFeatures()

  const [tab, setTab] = useState<Tab>('overview')

  // The books live on the server, so opening the panel is a good moment to
  // re-read them — provisioning first if this player has never traded.
  useEffect(() => {
    const finance = useFinanceStore.getState()
    if (finance.status === 'ready') {
      void Promise.all([finance.refreshFinance(), finance.refreshStore()])
    } else {
      void finance.load()
    }
  }, [])

  const ctx = {
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
  }

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABEL[category],
      actions: BUSINESS_ACTIONS.filter((a) => a.category === category).map((def) => ({
        def,
        availability: evaluateAction(def, ctx),
      })),
    })).filter((g) => g.actions.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIndex, unlocks, performedActions, performedInteractions, cash, collectedInfo])

  const filledRecords = RECORD_ROWS.filter((r) => records[r.key])
  const monthlyWage = team.reduce((sum, m) => sum + m.salary, 0)

  function close() {
    useWorldStore.getState().closePanel()
  }

  async function run(def: BusinessActionDef) {
    const result = await performBusinessAction(def.id)
    useWorldStore
      .getState()
      .pushToast(result.ok ? `${def.label} — done` : result.message, result.ok ? 'success' : 'warning')
  }

  return (
    <div className="panel-backdrop">
      <div className="panel panel--wide">
        <div className="panel__header">
          <div className="panel__avatar" style={{ background: '#ffd166' }}>
            <Icon name="briefcase" size={22} />
          </div>
          <div className="panel__heading">
            <h3 className="panel__title">{businessName}</h3>
            <div className="panel__sub">
              {filledRecords.length} of {RECORD_ROWS.length} records filled · team of {team.length}
              {stockUnits > 0 ? ` · ${stockUnits} units in stock` : ''}
            </div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="Close the books">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={tab === 'overview' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === 'actions' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('actions')}
          >
            Business actions
          </button>
          <button
            type="button"
            className={tab === 'finance' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('finance')}
          >
            Finance
          </button>
          <button
            type="button"
            className={tab === 'orders' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('orders')}
          >
            Orders
          </button>
          <button
            type="button"
            className={tab === 'team' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('team')}
          >
            Team
          </button>
        </div>

        <div className="panel__body">
          {tab === 'overview' && (
            <>
              <div className="chip-row">
                <span className="chip">Cash ₦{cash.toLocaleString()}</span>
                <span className="chip">Reputation {reputation}</span>
                <span className="chip">Level {levelIndex}</span>
                {monthlyWage > 0 && <span className="chip">Wages ₦{monthlyWage.toLocaleString()}/mo</span>}
              </div>

              <div className="section-title">Business log</div>
              {filledRecords.length === 0 && (
                <div className="empty-state">
                  The log is empty. Talk to people in the city and take business actions to fill it in.
                </div>
              )}
              {RECORD_ROWS.map((row) =>
                records[row.key] ? (
                  <div className="record" key={row.key}>
                    <span className="record__key">{row.label}</span>
                    <span className="record__value">{records[row.key]}</span>
                  </div>
                ) : null,
              )}

              <div className="section-title">CAC registration checklist</div>
              <div className="info-item">
                <div className="info-item__label">
                  {ctx.requirementInfoCount >= 3 ? '✓ Requirements collected' : `${ctx.requirementInfoCount}/3 requirements collected`}
                </div>
                <div className="info-item__detail">
                  Interview the registry official and collect all three requirements before completing registration.
                </div>
              </div>

              <div className="section-title">Collected research</div>
              <CollectedResearch collectedInfo={collectedInfo} />
            </>
          )}

          {tab === 'actions' && (
            <>
              {grouped.map((group) => (
                <div key={group.category}>
                  <div className="section-title">{group.label}</div>
                  {group.actions.map(({ def, availability }) => (
                    <button
                      key={def.id}
                      type="button"
                      className="interaction"
                      disabled={!availability.available}
                      onClick={() => run(def)}
                      title={availability.available ? def.description : availability.reason}
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
                </div>
              ))}
            </>
          )}

          {tab === 'finance' && <FinanceView />}

          {tab === 'orders' && <OrdersView />}

          {tab === 'team' && (
            <>
              <div className="section-title">Founding team</div>
              {team.length === 0 && (
                <div className="empty-state">
                  No one on payroll yet. Recruit a founding team once you reach that stage.
                </div>
              )}
              {team.map((m) => (
                <div className="team-member" key={m.npcId}>
                  <div className="panel__avatar" style={{ background: '#34d399', width: 38, height: 38, fontSize: 15 }}>
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="team-member__name">{m.name}</div>
                    <div className="team-member__role">
                      {m.role} · skill {m.skill}
                    </div>
                  </div>
                  <div className="interaction__meta">
                    <span className="interaction__cost">₦{m.salary.toLocaleString()}/mo</span>
                  </div>
                </div>
              ))}
              {team.length > 0 && (
                <div className="info-item">
                  <div className="info-item__label">Total wage bill</div>
                  <div className="info-item__detail">
                    ₦{monthlyWage.toLocaleString()} per month across {team.length} people.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel__footer">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Back to the city
          </button>
        </div>
      </div>
    </div>
  )
}

/** A compact view of the information the player has gathered from NPCs. */
function CollectedResearch({ collectedInfo }: { collectedInfo: ReturnType<typeof useGameStore.getState>['collectedInfo'] }) {
  if (collectedInfo.length === 0) {
    return (
      <div className="empty-state">
        No research yet. Interview customers, suppliers and competitors to build your evidence.
      </div>
    )
  }

  return (
    <>
      {collectedInfo.slice(0, 8).map((info) => (
        <div className="info-item" key={info.id}>
          <div className="info-item__label">{info.label}</div>
          <div className="info-item__detail">{info.detail}</div>
          <div className="info-item__source">
            {info.sourceNpcName} · {ROLE_BY_ID[info.sourceRole].label}
          </div>
        </div>
      ))}
      {collectedInfo.length > 8 && (
        <div className="info-item__source">+{collectedInfo.length - 8} more entries on record.</div>
      )}
    </>
  )
}
