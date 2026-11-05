import { create } from 'zustand'

export type PanelId = 'none' | 'phone' | 'business' | 'map' | 'settings' | 'tasks' | 'market' | 'progress'

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'warning'
  at: number
}

interface WorldState {
  /** NPC the player is currently talking to; opens the context panel. */
  activeNpcId: string | null
  /** Building the player is standing at. */
  activeBuildingId: string | null
  /** Which full-screen-ish panel is open over the world. */
  panel: PanelId
  toasts: Toast[]
  /** Set while the player is dragging the camera, so clicks do not select. */
  cameraDragging: boolean
  /** Whether the on-screen control hints are visible. */
  showHints: boolean
  /** Set while a blocking overlay (start screen, mission briefing) is up. */
  overlayOpen: boolean

  selectNpc: (id: string | null) => void
  selectBuilding: (id: string | null) => void
  openPanel: (panel: PanelId) => void
  closePanel: () => void
  pushToast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
  setCameraDragging: (dragging: boolean) => void
  toggleHints: () => void
  setOverlay: (open: boolean) => void
}

export const useWorldStore = create<WorldState>((set, get) => ({
  activeNpcId: null,
  activeBuildingId: null,
  panel: 'none',
  toasts: [],
  cameraDragging: false,
  showHints: true,
  overlayOpen: true,

  selectNpc: (id) => set({ activeNpcId: id, activeBuildingId: id ? null : get().activeBuildingId }),
  selectBuilding: (id) =>
    set({ activeBuildingId: id, activeNpcId: id ? null : get().activeNpcId }),
  openPanel: (panel) => set({ panel, activeNpcId: null }),
  closePanel: () => set({ panel: 'none' }),
  pushToast: (text, kind = 'info') =>
    set({
      toasts: [
        { id: `t_${Date.now()}_${Math.random()}`, text, kind, at: Date.now() },
        ...get().toasts,
      ].slice(0, 4),
    }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setCameraDragging: (cameraDragging) => set({ cameraDragging }),
  toggleHints: () => set({ showHints: !get().showHints }),
  setOverlay: (overlayOpen) => set({ overlayOpen }),
}))
