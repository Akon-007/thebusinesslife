import { useEffect, useMemo, useState } from 'react'
import { DISTRICT_BY_ID } from '../../data/buildings'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { npcRuntime } from '../../game/npcRuntime'
import { playerState } from '../../game/player/playerState'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import type { NPCRole } from '../../types/npc'
import { Icon } from '../Icon'

type Tab = 'messages' | 'contacts'

interface Contact {
  id: string
  name: string
  role: NPCRole
  roleLabel: string
  accent: string
  district: string
  distance: number
  bearing: string
  met: boolean
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Rough compass bearing from the player to a point, for spoken directions. */
function bearingLabel(dx: number, dz: number): string {
  const angle = Math.atan2(dx, -dz)
  const sector = Math.round(angle / (Math.PI / 4))
  return COMPASS[((sector % 8) + 8) % 8]
}

function readContacts(): Contact[] {
  const out: Contact[] = []
  for (const npc of npcRuntime.npcs) {
    if (npc.state === 'inside') continue
    const role = ROLE_BY_ID[npc.role]
    const dx = npc.position[0] - playerState.x
    const dz = npc.position[2] - playerState.z
    out.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      roleLabel: role.label,
      accent: role.accent,
      district: DISTRICT_BY_ID[npc.districtId]?.name ?? 'the city',
      distance: Math.hypot(dx, dz),
      bearing: bearingLabel(dx, dz),
      met: Object.keys(npc.interacted).length > 0,
    })
  }
  return out.sort((a, b) => a.distance - b.distance)
}

/**
 * The player's phone. It holds the message feed and the city directory, and it
 * is the HUD's answer to "where is the person I need to talk to right now?"
 */
export function PhonePanel() {
  const playerName = useGameStore((s) => s.playerName)
  const notifications = useGameStore((s) => s.notifications)
  const dismissNotification = useGameStore((s) => s.dismissNotification)

  const [tab, setTab] = useState<Tab>('messages')
  const [contacts, setContacts] = useState<Contact[]>(() => readContacts())

  useEffect(() => {
    if (tab !== 'contacts') return
    setContacts(readContacts())
    const id = window.setInterval(() => setContacts(readContacts()), 2000)
    return () => window.clearInterval(id)
  }, [tab])

  const sortedMessages = useMemo(
    () => [...notifications].sort((a, b) => b.at - a.at),
    [notifications],
  )

  function close() {
    useWorldStore.getState().closePanel()
  }

  function locate(contact: Contact) {
    useWorldStore
      .getState()
      .pushToast(
        `${contact.name} is in ${contact.district}, about ${Math.round(contact.distance)} m ${contact.bearing}.`,
        'info',
      )
  }

  return (
    <div className="panel-backdrop">
      <div className="panel">
        <div className="panel__header">
          <div className="panel__avatar" style={{ background: '#38bdf8' }}>
            <Icon name="phone" size={22} />
          </div>
          <div className="panel__heading">
            <h3 className="panel__title">Phone</h3>
            <div className="panel__sub">
              {playerName}
              {notifications.length > 0 ? ` · ${notifications.length} new` : ' · no new messages'}
            </div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="Put the phone away">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={tab === 'messages' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('messages')}
          >
            Messages
          </button>
          <button
            type="button"
            className={tab === 'contacts' ? 'tab tab--active' : 'tab'}
            onClick={() => setTab('contacts')}
          >
            City directory
          </button>
        </div>

        <div className="panel__body">
          {tab === 'messages' && (
            <>
              {sortedMessages.length === 0 && (
                <div className="empty-state">Nothing on the phone yet.</div>
              )}
              {sortedMessages.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-item notif-item--${n.kind}`}
                  style={{ textAlign: 'left', border: 'none', font: 'inherit', color: 'inherit' }}
                  onClick={() => dismissNotification(n.id)}
                  title="Tap to clear"
                >
                  <div className="notif-item__title">{n.title}</div>
                  {n.body && <div className="notif-item__body">{n.body}</div>}
                </button>
              ))}
            </>
          )}

          {tab === 'contacts' && (
            <>
              <div className="section-title">People in the city right now</div>
              {contacts.length === 0 && (
                <div className="empty-state">The streets are empty. Try again in a moment.</div>
              )}
              {contacts.slice(0, 30).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="record"
                  style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => locate(c)}
                  title="Get directions"
                >
                  <span className="record__key" style={{ color: c.accent }}>
                    {c.roleLabel}
                  </span>
                  <span className="record__value">
                    {c.name}
                    <span className="info-item__source" style={{ display: 'block' }}>
                      {c.district} · {Math.round(c.distance)} m {c.bearing}
                      {c.met ? ' · already spoken to' : ''}
                    </span>
                  </span>
                </button>
              ))}
              {contacts.length > 30 && (
                <div className="info-item">
                  <div className="info-item__detail">
                    Showing the {30} people closest to you of {contacts.length} on the street.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel__footer">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Back to the street
          </button>
        </div>
      </div>
    </div>
  )
}
