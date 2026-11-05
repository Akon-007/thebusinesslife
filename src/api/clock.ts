import { api } from './client'

/**
 * Typed access to the simulation clock.
 *
 * The world runs on its own time. The public read is what the heads-up display
 * polls to show the current day and time; the administrator reads and writes
 * are what pause the world, change its speed, and step it forward by hand.
 */

/** The clock, as the world feed exposes it — no administrative detail. */
export interface WorldClock {
  simTime: string
  day: number
  minuteOfDay: number
  elapsedMinutes: number
  running: boolean
  tickMinutes: number
  simMinutesPerRealMinute: number
  tickIntervalMs: number
}

/** The full clock, as the administrator sees it. */
export interface AdminClock {
  simTime: string
  simStartedAt: string
  day: number
  minuteOfDay: number
  elapsedMinutes: number
  running: boolean
  tickMinutes: number
  ticks: number
  lastTickAt: string | null
  updatedAt: string
  updatedBy: string | null
  simMinutesPerRealMinute: number
  tickIntervalMs: number
  tickMinutesRange: { min: number; max: number }
}

export interface SettledDay {
  day: number
  companies: number
  chargedKobo: number
  unpaid: number
  alreadySettled: boolean
}

export interface TickResult {
  applied: number
  simTime: string
  day: number
  settledDays: SettledDay[]
  chargedKobo: number
  eventsStarted: number
  eventsEnded: number
}

export interface DayRun {
  day: number
  simTime: string
  companies: number
  chargedKobo: number
  settledAt: string
}

/** The world's current time. Public — used by the in-game HUD. */
export function getWorldClock(): Promise<WorldClock> {
  return api<WorldClock>('/world/clock', { anonymous: true })
}

/** The administrator's full view of the clock, with recent settlements. */
export function getAdminClock(): Promise<{ clock: AdminClock; days: DayRun[] }> {
  return api<{ clock: AdminClock; days: DayRun[] }>('/admin/simulation/clock')
}

/** Pauses or resumes the world, and sets how many simulated minutes a tick is. */
export function updateAdminClock(input: {
  running?: boolean
  tickMinutes?: number
}): Promise<{ clock: AdminClock }> {
  return api<{ clock: AdminClock }>('/admin/simulation/clock', { method: 'PUT', body: input })
}

/** Steps the world forward by hand. Forced, so it works while paused. */
export function tickAdminClock(
  count = 1,
): Promise<{ clock: AdminClock; result: TickResult; days: DayRun[] }> {
  return api<{ clock: AdminClock; result: TickResult; days: DayRun[] }>(
    '/admin/simulation/clock/tick',
    { method: 'POST', body: { count } },
  )
}
