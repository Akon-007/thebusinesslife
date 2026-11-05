import { Router } from 'express'
import { getClock, toClock } from '../clock'
import { many } from '../db'
import { wrap } from '../middleware'
import {
  listOrNull,
  toInvestor,
  type BuildingOverrideRow,
  type DistrictOverrideRow,
  type InvestorRow,
  type RoleOverrideRow,
  type SectorOverrideRow,
} from '../world'

/**
 * The world settings the player application applies.
 *
 * Read-only and unauthenticated on purpose. The city has to be seeded *before*
 * anything is rendered — the instanced crowd meshes take their instance count
 * at mount — and that happens before a player has signed in. Nothing personal is
 * served here: only the administrator's deviations from the world catalogue, so
 * the crowd, the districts, the buildings and the onboarding sectors a player
 * meets match what the portal published.
 *
 * Internal notes are deliberately not included.
 */

const router = Router()

router.get(
  '/config',
  wrap(async (_req, res) => {
    const roleRows = many<RoleOverrideRow>('SELECT * FROM npc_role_overrides')
    const sectorRows = many<SectorOverrideRow>('SELECT * FROM sector_overrides')
    const districtRows = many<DistrictOverrideRow>('SELECT * FROM district_overrides')
    const buildingRows = many<BuildingOverrideRow>('SELECT * FROM building_overrides')
    const investorRows = many<InvestorRow>('SELECT * FROM investors WHERE active = 1 ORDER BY name ASC')

    res.json({
      roles: roleRows.map((row) => ({
        role: row.role,
        spawnCount: row.spawn_count,
        spawnDistricts: listOrNull(row.spawn_districts),
        active: row.active === null ? null : row.active === 1,
      })),
      sectors: sectorRows.map((row) => ({
        sector: row.sector,
        active: row.active === null ? null : row.active === 1,
        briefing: row.briefing,
      })),
      districts: districtRows.map((row) => ({
        districtId: row.district_id,
        active: row.active === null ? null : row.active === 1,
        footfall: row.footfall,
      })),
      buildings: buildingRows.map((row) => ({
        buildingId: row.building_id,
        active: row.active === null ? null : row.active === 1,
      })),
      investors: investorRows.map((row) => {
        const investor = toInvestor(row)
        return {
          id: investor.id,
          name: investor.name,
          organisation: investor.organisation,
          stageFocus: investor.stageFocus,
          ticket: investor.ticket,
          sectors: investor.sectors,
        }
      }),
    })
  }),
)

/**
 * The world's current time.
 *
 * Public and read-only, like the settings above: the city clock is shown on the
 * player's heads-up display, which is drawn before the player signs in. Only the
 * simulated instant is served — never who changed it or what it has charged.
 */
router.get(
  '/clock',
  wrap(async (_req, res) => {
    const clock = toClock(getClock())
    res.json({
      simTime: clock.simTime,
      day: clock.day,
      minuteOfDay: clock.minuteOfDay,
      elapsedMinutes: clock.elapsedMinutes,
      running: clock.running,
      tickMinutes: clock.tickMinutes,
      simMinutesPerRealMinute: clock.simMinutesPerRealMinute,
      tickIntervalMs: clock.tickIntervalMs,
    })
  }),
)

export default router
