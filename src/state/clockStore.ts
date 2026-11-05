import { create } from 'zustand'
import { getWorldClock, type WorldClock } from '../api/clock'

/**
 * The world's current time, as the interface sees it.
 *
 * The server owns the clock; this store only mirrors it. It polls the public
 * world feed at a cadence a little faster than the tick interval, so the day
 * and time shown in the HUD follow the world rather than being guessed at.
 *
 * `start`/`stop` are idempotent so several components can ask for the clock
 * without spawning several pollers.
 */

const POLL_MS = 3_000

interface ClockState {
  clock: WorldClock | null
  syncedAt: string | null
  start: () => void
  stop: () => void
  refresh: () => Promise<void>
}

let timer: number | null = null

export const useClockStore = create<ClockState>((set) => ({
  clock: null,
  syncedAt: null,

  refresh: async () => {
    try {
      const clock = await getWorldClock()
      set({ clock, syncedAt: new Date().toISOString() })
    } catch {
      // A missed poll is not worth surfacing: the last known time stands and
      // the next poll will correct it. The clock is cosmetic on the client.
    }
  },

  start: () => {
    if (timer !== null) return
    void useClockStore.getState().refresh()
    timer = window.setInterval(() => {
      void useClockStore.getState().refresh()
    }, POLL_MS)
  },

  stop: () => {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  },
}))

/** "HH:MM" for a minute offset from midnight, in the world's own time. */
export function formatSimTime(minuteOfDay: number): string {
  const minutes = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
