import { useMemo, useRef, useState } from 'react'
import { DISTRICTS, buildingsByDistrict } from '../../data/buildings'
import { playerState } from '../../game/player/playerState'
import { missionForLevel } from '../../systems/progression/progressionEngine'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import type { District } from '../../types/world'
import { Icon } from '../Icon'
import { CityMapCanvas } from '../map/CityMapCanvas'

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

function bearingLabel(dx: number, dz: number): string {
  const angle = Math.atan2(dx, -dz)
  const sector = Math.round(angle / (Math.PI / 4))
  return COMPASS[((sector % 8) + 8) % 8]
}

/** The district whose tile contains a world point, if any. */
function districtAt(x: number, z: number): District | null {
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.center[0]) <= d.size[0] && Math.abs(z - d.center[1]) <= d.size[1]) {
      return d
    }
  }
  return null
}

/**
 * The full city map — the blueprint at full size.
 *
 * It is the same drawing as the minimap, opened up: districts, avenues, the
 * lagoon, the crowd and the mission markers, all live. The player can tap the
 * map to be told which way to walk, and the side rail keeps the mission's
 * outstanding errands and every district one tap away.
 */
export function MapPanel() {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const progress = useGameStore((s) => s.progress)
  const [highlight, setHighlight] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)

  const mission = missionForLevel(levelIndex)
  const pendingObjectives = useMemo(
    () => mission?.objectives.filter((o) => !progress.find((p) => p.objectiveId === o.id)?.done) ?? [],
    [mission, progress],
  )

  function close() {
    useWorldStore.getState().closePanel()
  }

  function navigate(name: string, center: [number, number]) {
    const dx = center[0] - playerState.x
    const dz = center[1] - playerState.z
    const dist = Math.hypot(dx, dz)
    useWorldStore
      .getState()
      .pushToast(`Head ${bearingLabel(dx, dz)} to ${name} — about ${Math.round(dist)} m on foot.`, 'info')
  }

  function pick(world: { x: number; z: number }) {
    const district = districtAt(world.x, world.z)
    if (district) {
      setHighlight(district.id)
      navigate(district.name, district.center)
      return
    }
    const where = world.z > 160 ? 'the lagoon' : world.x > 185 ? 'the creek' : 'open ground outside the districts'
    useWorldStore.getState().pushToast(`That is ${where}. Tap a district to be pointed the right way.`, 'info')
  }

  function hover(world: { x: number; z: number }) {
    const district = districtAt(world.x, world.z)
    const id = district?.id ?? null
    if (hoverRef.current === id) return
    hoverRef.current = id
    setHighlight(id)
  }

  return (
    <div className="map-overlay" onClick={close}>
      <div className="map-shell" onClick={(event) => event.stopPropagation()}>
        <header className="map-shell__head">
          <div className="map-shell__badge">
            <Icon name="map" size={22} />
          </div>
          <div className="map-shell__titles">
            <h2 className="map-shell__title">City Map</h2>
            <div className="map-shell__sub">
              {DISTRICTS.length} districts · Lagos mainland and island · tap anywhere for directions
            </div>
          </div>
          <button type="button" className="panel__close" onClick={close} aria-label="Close the map">
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="map-shell__body">
          <div className="map-shell__stage">
            <CityMapCanvas
              detail
              padding={30}
              refreshMs={110}
              highlightDistrictId={highlight}
              onPick={pick}
              onHover={hover}
              className="map-canvas"
            />
            <div className="map-legend">
              <span className="map-legend__item">
                <span className="map-legend__swatch map-legend__swatch--player" /> You
              </span>
              <span className="map-legend__item">
                <span className="map-legend__swatch map-legend__swatch--crowd" /> People
              </span>
              <span className="map-legend__item">
                <span className="map-legend__swatch map-legend__swatch--mission" /> Mission
              </span>
              <span className="map-legend__item">
                <span className="map-legend__swatch map-legend__swatch--water" /> Lagoon
              </span>
            </div>
          </div>

          <aside className="map-shell__rail">
            {pendingObjectives.length > 0 && (
              <section className="map-rail-section">
                <div className="section-title">Where to go next</div>
                {pendingObjectives.map((o) => (
                  <div className="info-item" key={o.id}>
                    <div className="info-item__label">{o.text}</div>
                    {o.hintLocation && <div className="info-item__detail">Look in {o.hintLocation}</div>}
                    {o.hint && <div className="info-item__source">{o.hint}</div>}
                  </div>
                ))}
              </section>
            )}

            <section className="map-rail-section">
              <div className="section-title">Districts</div>
              <div className="map-districts">
                {DISTRICTS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`map-district${highlight === d.id ? ' map-district--active' : ''}`}
                    onClick={() => {
                      setHighlight(d.id)
                      navigate(d.name, d.center)
                    }}
                    onMouseEnter={() => setHighlight(d.id)}
                    onMouseLeave={() => setHighlight(null)}
                    title="Get directions"
                  >
                    <span className="map-district__dot" style={{ background: d.groundColor }} />
                    <span className="map-district__main">
                      <span className="map-district__name">{d.name}</span>
                      <span className="map-district__places">
                        {buildingsByDistrict(d.id)
                          .map((b) => b.name)
                          .join(' · ')}
                      </span>
                    </span>
                    <Icon name="target" size={15} />
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
