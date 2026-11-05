import { useWorldStore } from '../state/worldStore'
import { CityMapCanvas } from './map/CityMapCanvas'

/**
 * The corner minimap: the same blueprint as the full map, drawn small.
 *
 * Tapping it opens the full map, which grows out of this corner — that motion
 * is what makes the two feel like one map at two scales.
 */
export function Minimap() {
  const openPanel = useWorldStore((s) => s.openPanel)

  return (
    <button
      type="button"
      className="minimap"
      onClick={() => openPanel('map')}
      title="Open the city map"
      aria-label="Open the city map"
    >
      <span className="minimap__frame">
        <CityMapCanvas detail={false} padding={5} refreshMs={140} className="map-canvas" />
      </span>
      <span className="minimap__label">
        <span>City Map</span>
        <span className="minimap__hint">Tap to expand</span>
      </span>
    </button>
  )
}
