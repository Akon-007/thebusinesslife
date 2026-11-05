import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Minimap } from './Minimap'
import { useGameStore } from '../state/gameStore'
import { useWorldStore } from '../state/worldStore'
import { formatSimTime, useClockStore } from '../state/clockStore'
import {
  currentLevelDef,
  missionForLevel,
  stageForLevel,
  xpForLevel,
} from '../systems/progression/progressionEngine'
import { ROLE_BY_ID } from '../data/npcCatalog'
import {
  handleBuildingClick,
  handleNpcClick,
  nearbyBuildings,
  nearestInteractableNpc,
} from '../game/interaction/selection'

/**
 * The gameplay HUD. The world stays the dominant element: everything here is
 * translucent, docked to an edge, and none of it covers the middle of the
 * screen where the player is walking.
 */
export function Hud() {
  const startClock = useClockStore((s) => s.start)
  const stopClock = useClockStore((s) => s.stop)

  useEffect(() => {
    startClock()
    return () => stopClock()
  }, [startClock, stopClock])

  return (
    <>
      <MissionTracker />
      <Minimap />
      <ActionBar />
      <Toasts />
      <ContextPrompt />
      <ControlHints />
      <TopBar />
    </>
  )
}

/* ---------------------------------------------------------------- top bar */

function TopBar() {
  const playerName = useGameStore((s) => s.playerName)
  const businessName = useGameStore((s) => s.businessName)
  const levelIndex = useGameStore((s) => s.levelIndex)
  const xp = useGameStore((s) => s.xp)
  const cash = useGameStore((s) => s.cash)
  const reputation = useGameStore((s) => s.reputation)
  const notifications = useGameStore((s) => s.notifications)

  const [drawerOpen, setDrawerOpen] = useState(false)

  const level = currentLevelDef(levelIndex)
  const need = xpForLevel(levelIndex)
  const into = xp % need
  const pct = Math.min(100, Math.round((into / need) * 100))

  return (
    <div className="hud-topbar">
      <div className="player-card">
        <div className="avatar">{playerName.slice(0, 1).toUpperCase()}</div>
        <div className="player-meta">
          <div className="player-name">{playerName}</div>
          <div className="business-name">{businessName}</div>
          <div className="xp-row">
            <span className="level-pill">Lv {level.index}</span>
            <span className="xp-bar">
              <span className="xp-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="xp-text">{into}/{need} XP</span>
          </div>
        </div>
      </div>

      <div className="stat-cluster">
        <div className="stat-chip stat-chip--cash">
          <span className="stat-chip__icon">
            <Icon name="coin" size={16} />
          </span>
          <span>
            <span className="stat-chip__label">Cash</span>
            <div className="stat-chip__value">₦{cash.toLocaleString()}</div>
          </span>
        </div>

        <div className="stat-chip stat-chip--rep">
          <span className="stat-chip__icon">
            <Icon name="star" size={16} />
          </span>
          <span>
            <span className="stat-chip__label">Reputation</span>
            <div className="stat-chip__value">{reputation}</div>
          </span>
        </div>

        <SimClockChip />

        <button
          type="button"
          className="icon-btn"
          title="Notifications"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <Icon name="bell" size={19} />
          {notifications.length > 0 && (
            <span className="icon-btn__badge">{notifications.length}</span>
          )}
        </button>

        {drawerOpen && <NotificationDrawer onClose={() => setDrawerOpen(false)} />}
      </div>
    </div>
  )
}

function SimClockChip() {
  const clock = useClockStore((s) => s.clock)

  return (
    <div className="stat-chip stat-chip--clock" title="World time">
      <span className="stat-chip__icon">
        <Icon name="monitor" size={16} />
      </span>
      <span>
        <span className="stat-chip__label">Day {clock ? clock.day : '—'}</span>
        <div className="stat-chip__value">{clock ? formatSimTime(clock.minuteOfDay) : '--:--'}</div>
      </span>
    </div>
  )
}

function NotificationDrawer({ onClose }: { onClose: () => void }) {
  const notifications = useGameStore((s) => s.notifications)
  const dismiss = useGameStore((s) => s.dismissNotification)

  return (
    <div className="notif-drawer">
      <div className="ui-row" style={{ marginBottom: 4 }}>
        <strong style={{ fontSize: 13 }}>Notifications</strong>
        <span className="spacer" />
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>

      {notifications.length === 0 && <div className="empty-state">Nothing new right now.</div>}

      {notifications.map((n) => (
        <div
          key={n.id}
          className={`notif-item notif-item--${n.kind}`}
          onClick={() => dismiss(n.id)}
          title="Dismiss"
        >
          <div className="notif-item__title">{n.title}</div>
          {n.body && <div className="notif-item__body">{n.body}</div>}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- mission */

function MissionTracker() {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const progress = useGameStore((s) => s.progress)

  const level = currentLevelDef(levelIndex)
  const mission = missionForLevel(levelIndex)
  const stage = stageForLevel(levelIndex)
  if (!mission) return null

  const doneCount = progress.filter((p) => p.done).length
  const total = mission.objectives.length || 1

  return (
    <div className="mission-card">
      <div className="mission-card__head">
        <span className="mission-card__stage">{stage.name}</span>
        <span className="mission-card__level">
          Lv {level.index} · {doneCount}/{total}
        </span>
      </div>
      <h3 className="mission-card__title">{mission.title}</h3>
      <p className="mission-card__brief">{mission.briefing}</p>

      <ul className="objectives">
        {mission.objectives.map((o) => {
          const p = progress.find((x) => x.objectiveId === o.id)
          const done = !!p?.done
          return (
            <li className={`objective ${done ? 'objective--done' : ''}`} key={o.id}>
              <span className="objective__tick">{done ? '✓' : ''}</span>
              <span className="objective__text">
                {o.text}
                {!done && o.hintLocation && (
                  <span className="objective__hint">Go to: {o.hintLocation}</span>
                )}
                {!done && !o.hintLocation && o.hint && (
                  <span className="objective__hint">{o.hint}</span>
                )}
              </span>
              {o.count > 1 && (
                <span className="objective__count">
                  {Math.min(p?.progress ?? 0, o.count)}/{o.count}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mission-progress">
        <div className="mission-progress__fill" style={{ width: `${(doneCount / total) * 100}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- action bar */

function ActionBar() {
  const openPanel = useWorldStore((s) => s.openPanel)
  return (
    <div className="action-bar app-bottom-nav">
      <button type="button" className="action-btn action-btn--active" onClick={() => openPanel('none')} title="Home">
        <span className="action-btn__icon"><Icon name="building" size={20} /></span>
        <span className="action-btn__label">Home</span>
      </button>
      <button type="button" className="action-btn" onClick={() => openPanel('tasks')} title="Tasks">
        <span className="action-btn__icon"><Icon name="target" size={20} /></span>
        <span className="action-btn__label">Tasks</span>
      </button>
      <button type="button" className="action-btn" onClick={() => openPanel('market')} title="Market">
        <span className="action-btn__icon"><Icon name="tag" size={20} /></span>
        <span className="action-btn__label">Market</span>
      </button>
      <button
        type="button"
        className="action-btn"
        onClick={() => openPanel('phone')}
        title="Phone — contacts and messages"
      >
        <span className="action-btn__icon">
          <Icon name="phone" size={20} />
        </span>
        <span className="action-btn__label">Phone</span>
      </button>
      <button
        type="button"
        className="action-btn action-btn--accent"
        onClick={() => openPanel('business')}
        title="Business — actions, records and team"
      >
        <span className="action-btn__icon">
          <Icon name="briefcase" size={20} />
        </span>
        <span className="action-btn__label">Business</span>
      </button>
      <button
        type="button"
        className="action-btn"
        onClick={() => openPanel('settings')}
        title="More"
      >
        <span className="action-btn__icon">
          <Icon name="gear" size={20} />
        </span>
        <span className="action-btn__label">More</span>
      </button>
    </div>
  )
}

/* ----------------------------------------------------------------- toasts */

function Toasts() {
  const toasts = useWorldStore((s) => s.toasts)
  const dismiss = useWorldStore((s) => s.dismissToast)
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    for (const t of toasts) {
      if (timers.current.has(t.id)) continue
      const handle = window.setTimeout(() => {
        timers.current.delete(t.id)
        dismiss(t.id)
      }, 4500)
      timers.current.set(t.id, handle)
    }
  }, [toasts, dismiss])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const handle of map.values()) clearTimeout(handle)
      map.clear()
    }
  }, [])

  if (!toasts.length) return null

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.kind}`}
          onClick={() => dismiss(t.id)}
          style={{ cursor: 'pointer' }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------- context prompt */

interface PromptTarget {
  kind: 'npc' | 'building'
  id: string
  text: string
}

function ContextPrompt() {
  const [target, setTarget] = useState<PromptTarget | null>(null)
  const targetRef = useRef<PromptTarget | null>(null)
  targetRef.current = target

  // Polling at ~5Hz is plenty for a proximity prompt and costs nothing per frame.
  useEffect(() => {
    const id = window.setInterval(() => {
      const world = useWorldStore.getState()
      if (world.overlayOpen || world.panel !== 'none' || world.activeNpcId || world.activeBuildingId) {
        setTarget(null)
        return
      }

      const npc = nearestInteractableNpc()
      if (npc) {
        setTarget({
          kind: 'npc',
          id: npc.id,
          text: `Talk to ${npc.name} · ${ROLE_BY_ID[npc.role].label}`,
        })
        return
      }

      const building = nearbyBuildings()[0]
      if (building) {
        setTarget({ kind: 'building', id: building.id, text: `Go into ${building.name}` })
        return
      }

      setTarget(null)
    }, 190)

    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'e' || event.repeat) return
      const active = document.activeElement
      if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) return
      const world = useWorldStore.getState()
      if (world.overlayOpen || world.panel !== 'none') return

      const t = targetRef.current
      if (!t) return
      if (t.kind === 'npc') handleNpcClick(t.id)
      else handleBuildingClick(t.id)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!target) return null

  function activate() {
    if (!target) return
    if (target.kind === 'npc') handleNpcClick(target.id)
    else handleBuildingClick(target.id)
  }

  return (
    <button type="button" className="context-prompt" onClick={activate}>
      <span className="context-prompt__key">E</span>
      <span>{target.text}</span>
    </button>
  )
}

/* --------------------------------------------------------- control hints */

function ControlHints() {
  const showHints = useWorldStore((s) => s.showHints)
  if (!showHints) return null
  return (
    <div className="control-hints">
      <span>
        <b>WASD</b> move
      </span>
      <span>
        <b>Shift</b> sprint
      </span>
      <span>
        <b>Drag</b> camera
      </span>
      <span>
        <b>Scroll</b> zoom
      </span>
      <span>
        <b>E</b> interact
      </span>
    </div>
  )
}
