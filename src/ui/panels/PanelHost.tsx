import { useWorldStore } from '../../state/worldStore'
import { NpcPanel } from './NpcPanel'
import { BuildingPanel } from './BuildingPanel'
import { PhonePanel } from './PhonePanel'
import { BusinessPanel } from './BusinessPanel'
import { MapPanel } from './MapPanel'
import { SettingsPanel } from './SettingsPanel'
import { TasksPanel } from './TasksPanel'
import { MarketPanel } from './MarketPanel'
import { ProgressPanel } from './ProgressPanel'

/**
 * Renders whichever contextual panel is currently open. A conversation and a
 * building always win over the utility panels, so the player can never end up
 * with two panels fighting for the same space.
 */
export function PanelHost() {
  const activeNpcId = useWorldStore((s) => s.activeNpcId)
  const activeBuildingId = useWorldStore((s) => s.activeBuildingId)
  const panel = useWorldStore((s) => s.panel)

  if (activeNpcId) return <NpcPanel npcId={activeNpcId} />
  if (activeBuildingId) return <BuildingPanel buildingId={activeBuildingId} />

  switch (panel) {
    case 'phone':
      return <PhonePanel />
    case 'business':
      return <BusinessPanel />
    case 'map':
      return <MapPanel />
    case 'settings':
      return <SettingsPanel />
    case 'tasks':
      return <TasksPanel />
    case 'market':
      return <MarketPanel />
    case 'progress':
      return <ProgressPanel />
    default:
      return null
  }
}
