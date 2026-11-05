import { fetchProgress } from './evidenceApi'
import { useGameStore } from './gameStore'

/**
 * Adopts the server's picture of the player's progress.
 *
 * The player application keeps a local copy of progression so the HUD reacts
 * instantly and survives a reload — but it is a *cache*. The authoritative
 * figures (xp, reputation, level, completed levels, objective progress) are
 * derived on the server from recorded evidence, and this pulls them down when
 * the city loads. Nothing here ever writes a level or a balance back up.
 */
export function startProgressSync(): () => void {
  let cancelled = false

  void fetchProgress()
    .then((snapshot) => {
      if (!cancelled) useGameStore.getState().adoptServerProgress(snapshot)
    })
    .catch(() => {
      /* offline: the local cache stands until the server can be reached */
    })

  return () => {
    cancelled = true
  }
}
