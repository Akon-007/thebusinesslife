import { Router } from 'express'
import { z } from 'zod'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { newId } from '../security'
import { audit } from '../users'
import {
  BUILDINGS,
  INVESTOR_STAGES,
  SECTORS,
  isBuildingId,
  isDistrictId,
  isNpcRole,
  isSector,
  toBuildingOverride,
  toDistrictOverride,
  toInvestor,
  toRoleOverride,
  toSectorOverride,
  worldVocabulary,
  type BuildingOverrideRow,
  type DistrictOverrideRow,
  type InvestorRow,
  type RoleOverrideRow,
  type SectorOverrideRow,
} from '../world'

/**
 * Administrator world management: the crowd, the investors, the business
 * sectors and the city itself.
 *
 * As with levels and missions, the world is authored in the player application
 * and is not redefined here. Districts, buildings, the fourteen NPC roles and
 * their interactions are a client contract; this area stores *overrides* on top
 * of it, plus whole new records in the case of investors.
 *
 * Every write is validated and recorded in the audit trail.
 *
 * A PUT replaces the whole override, so a field the caller omits is stored as
 * NULL and the catalogue value applies again.
 */

const router = Router()

/* -------------------------------------------------------- shared helpers -- */

const districtList = z
  .array(z.string())
  .max(6)
  .refine((ids) => ids.every(isDistrictId), { message: 'That is not a district in this city.' })

/**
 * How many authored mission objectives depend on each target.
 *
 * Closing a building or switching off an NPC role is not free: a level may
 * require the player to visit that kind of place or speak to that kind of
 * person. Counting the dependencies first is what makes the warning honest.
 */
function objectiveDependencyCounts(type: string) {
  const rows = many<{ target: string; n: number }>(
    `SELECT o.target, COUNT(*) AS n
     FROM mission_objectives o
     JOIN missions m ON m.id = o.mission_id
     WHERE o.type = ?
     GROUP BY o.target`,
    type,
  )
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.target, Number(row.n))
  return map
}

/** Companies, players and progress per sector, read from stored rows. */
function sectorAdoption() {
  const companies = many<{ sector: string; n: number }>(
    'SELECT sector, COUNT(*) AS n FROM business_profiles GROUP BY sector',
  )
  const map = new Map<string, { companies: number; players: number; averageLevel: number }>()

  for (const row of companies) {
    map.set(row.sector, {
      companies: Number(row.n),
      players: 0,
      averageLevel: 0,
    })
  }

  // Average level of the players whose company sits in each sector.
  const joined = many<{ sector: string; level_index: number }>(
    `SELECT b.sector AS sector, p.level_index AS level_index
     FROM business_profiles b
     JOIN player_progress p ON p.user_id = b.user_id`,
  )
  const totals = new Map<string, { sum: number; n: number }>()
  for (const row of joined) {
    const entry = totals.get(row.sector) ?? { sum: 0, n: 0 }
    entry.sum += row.level_index
    entry.n += 1
    totals.set(row.sector, entry)
  }

  for (const [sector, total] of totals) {
    const entry = map.get(sector) ?? { companies: 0, players: 0, averageLevel: 0 }
    entry.players = total.n
    entry.averageLevel = total.n === 0 ? 0 : total.sum / total.n
    map.set(sector, entry)
  }

  return map
}

/* ------------------------------------------------------------ vocabulary -- */

router.get(
  '/world/meta',
  wrap(async (_req, res) => {
    res.json(worldVocabulary())
  }),
)

/* ------------------------------------------------------------- the crowd -- */

router.get(
  '/world/npcs',
  wrap(async (_req, res) => {
    const overrides = new Map<string, RoleOverrideRow>()
    for (const row of many<RoleOverrideRow>('SELECT * FROM npc_role_overrides')) {
      overrides.set(row.role, row)
    }

    // Authored missions that ask the player to speak to a given role.
    const talkDependencies = objectiveDependencyCounts('talk_role')

    const roles = worldVocabulary().roles.map((role) => {
      const row = overrides.get(role.value)
      return {
        ...role,
        override: row ? toRoleOverride(row) : null,
        /** Authored mission objectives that require talking to this role. */
        requiredByMissions: talkDependencies.get(role.value) ?? 0,
      }
    })

    res.json({
      roles,
      overridden: overrides.size,
      totalRoles: roles.length,
    })
  }),
)

const roleOverrideSchema = z.object({
  spawnCount: z.number().int().min(0).max(60).nullish(),
  spawnDistricts: districtList.nullish(),
  active: z.boolean().nullish(),
})

router.put(
  '/world/npcs/:role',
  wrap(async (req, res) => {
    const role = String(req.params.role)
    if (!isNpcRole(role)) {
      res.status(404).json({ error: 'That is not an NPC role in this city.' })
      return
    }

    const parsed = roleOverrideSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those settings.' })
      return
    }

    const data = parsed.data
    const now = new Date().toISOString()

    run(
      `INSERT INTO npc_role_overrides (role, spawn_count, spawn_districts, active, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(role) DO UPDATE SET
         spawn_count = excluded.spawn_count,
         spawn_districts = excluded.spawn_districts,
         active = excluded.active,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      role,
      data.spawnCount ?? null,
      data.spawnDistricts ? JSON.stringify(data.spawnDistricts) : null,
      data.active === null || data.active === undefined ? null : data.active ? 1 : 0,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.world.npc.update', `Updated the ${role} role's city settings`)

    const row = one<RoleOverrideRow>('SELECT * FROM npc_role_overrides WHERE role = ?', role)
    res.json({ override: row ? toRoleOverride(row) : null })
  }),
)

router.delete(
  '/world/npcs/:role',
  wrap(async (req, res) => {
    const role = String(req.params.role)
    if (!isNpcRole(role)) {
      res.status(404).json({ error: 'That is not an NPC role in this city.' })
      return
    }

    const existing = one<RoleOverrideRow>('SELECT * FROM npc_role_overrides WHERE role = ?', role)
    if (!existing) {
      res.status(400).json({ error: 'That role is already using the catalogue settings.' })
      return
    }

    run('DELETE FROM npc_role_overrides WHERE role = ?', role)
    audit(req.user!.id, 'admin.world.npc.reset', `Reset the ${role} role to the catalogue`)

    res.json({ ok: true })
  }),
)

/* --------------------------------------------------------- business sectors -- */

router.get(
  '/world/sectors',
  wrap(async (_req, res) => {
    const overrides = new Map<string, SectorOverrideRow>()
    for (const row of many<SectorOverrideRow>('SELECT * FROM sector_overrides')) {
      overrides.set(row.sector, row)
    }
    const adoption = sectorAdoption()

    const sectors = SECTORS.map((sector) => {
      const row = overrides.get(sector)
      const stats = adoption.get(sector)
      return {
        sector,
        override: row ? toSectorOverride(row) : null,
        companies: stats?.companies ?? 0,
        players: stats?.players ?? 0,
        averageLevel: stats?.averageLevel ?? 0,
      }
    })

    res.json({
      sectors,
      overridden: overrides.size,
      totalSectors: sectors.length,
    })
  }),
)

const sectorOverrideSchema = z.object({
  active: z.boolean().nullish(),
  briefing: z.string().trim().max(400).nullish(),
})

router.put(
  '/world/sectors/:sector',
  wrap(async (req, res) => {
    const sector = String(req.params.sector)
    if (!isSector(sector)) {
      res.status(404).json({ error: 'That is not a business sector in this simulation.' })
      return
    }

    const parsed = sectorOverrideSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those settings.' })
      return
    }

    const data = parsed.data
    const now = new Date().toISOString()

    run(
      `INSERT INTO sector_overrides (sector, active, briefing, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sector) DO UPDATE SET
         active = excluded.active,
         briefing = excluded.briefing,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      sector,
      data.active === null || data.active === undefined ? null : data.active ? 1 : 0,
      data.briefing ?? null,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.world.sector.update', `Updated the ${sector} sector`)

    const row = one<SectorOverrideRow>('SELECT * FROM sector_overrides WHERE sector = ?', sector)
    res.json({ override: row ? toSectorOverride(row) : null })
  }),
)

router.delete(
  '/world/sectors/:sector',
  wrap(async (req, res) => {
    const sector = String(req.params.sector)
    if (!isSector(sector)) {
      res.status(404).json({ error: 'That is not a business sector in this simulation.' })
      return
    }

    const existing = one<SectorOverrideRow>('SELECT * FROM sector_overrides WHERE sector = ?', sector)
    if (!existing) {
      res.status(400).json({ error: 'That sector is already using the catalogue settings.' })
      return
    }

    run('DELETE FROM sector_overrides WHERE sector = ?', sector)
    audit(req.user!.id, 'admin.world.sector.reset', `Reset the ${sector} sector to the catalogue`)

    res.json({ ok: true })
  }),
)

/* -------------------------------------------------------------- the city -- */

router.get(
  '/world/city',
  wrap(async (_req, res) => {
    const districtOverrides = new Map<string, DistrictOverrideRow>()
    for (const row of many<DistrictOverrideRow>('SELECT * FROM district_overrides')) {
      districtOverrides.set(row.district_id, row)
    }

    const buildingOverrides = new Map<string, BuildingOverrideRow>()
    for (const row of many<BuildingOverrideRow>('SELECT * FROM building_overrides')) {
      buildingOverrides.set(row.building_id, row)
    }

    // Authored missions that send the player to a kind of place.
    const visitDependencies = objectiveDependencyCounts('visit_building')

    const districts = worldVocabulary().districts.map((district) => {
      const row = districtOverrides.get(district.id)
      const buildings = BUILDINGS.filter((b) => b.districtId === district.id)
      return {
        ...district,
        override: row ? toDistrictOverride(row) : null,
        buildingCount: buildings.length,
      }
    })

    const buildings = BUILDINGS.map((building) => {
      const row = buildingOverrides.get(building.id)
      return {
        ...building,
        override: row ? toBuildingOverride(row) : null,
        requiredByMissions: visitDependencies.get(building.type) ?? 0,
      }
    })

    res.json({
      districts,
      buildings,
      overriddenDistricts: districtOverrides.size,
      overriddenBuildings: buildingOverrides.size,
    })
  }),
)

const districtOverrideSchema = z.object({
  active: z.boolean().nullish(),
  /** Crowd weight: how eagerly NPCs are placed in this district. 0 excludes it. */
  footfall: z.number().int().min(0).max(10).nullish(),
  notes: z.string().trim().max(400).nullish(),
})

router.put(
  '/world/city/districts/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    if (!isDistrictId(id)) {
      res.status(404).json({ error: 'That is not a district in this city.' })
      return
    }

    const parsed = districtOverrideSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those settings.' })
      return
    }

    const data = parsed.data
    const now = new Date().toISOString()

    run(
      `INSERT INTO district_overrides (district_id, active, footfall, notes, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(district_id) DO UPDATE SET
         active = excluded.active,
         footfall = excluded.footfall,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      id,
      data.active === null || data.active === undefined ? null : data.active ? 1 : 0,
      data.footfall ?? null,
      data.notes ?? null,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.world.district.update', `Updated the district ${id}`)

    const row = one<DistrictOverrideRow>('SELECT * FROM district_overrides WHERE district_id = ?', id)
    res.json({ override: row ? toDistrictOverride(row) : null })
  }),
)

router.delete(
  '/world/city/districts/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    if (!isDistrictId(id)) {
      res.status(404).json({ error: 'That is not a district in this city.' })
      return
    }

    const existing = one<DistrictOverrideRow>(
      'SELECT * FROM district_overrides WHERE district_id = ?',
      id,
    )
    if (!existing) {
      res.status(400).json({ error: 'That district is already using the catalogue settings.' })
      return
    }

    run('DELETE FROM district_overrides WHERE district_id = ?', id)
    audit(req.user!.id, 'admin.world.district.reset', `Reset the district ${id} to the catalogue`)

    res.json({ ok: true })
  }),
)

const buildingOverrideSchema = z.object({
  active: z.boolean().nullish(),
  notes: z.string().trim().max(400).nullish(),
})

router.put(
  '/world/city/buildings/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    if (!isBuildingId(id)) {
      res.status(404).json({ error: 'That is not a building in this city.' })
      return
    }

    const parsed = buildingOverrideSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those settings.' })
      return
    }

    const data = parsed.data
    const now = new Date().toISOString()

    run(
      `INSERT INTO building_overrides (building_id, active, notes, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(building_id) DO UPDATE SET
         active = excluded.active,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      id,
      data.active === null || data.active === undefined ? null : data.active ? 1 : 0,
      data.notes ?? null,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.world.building.update', `Updated the building ${id}`)

    const row = one<BuildingOverrideRow>('SELECT * FROM building_overrides WHERE building_id = ?', id)
    res.json({ override: row ? toBuildingOverride(row) : null })
  }),
)

router.delete(
  '/world/city/buildings/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    if (!isBuildingId(id)) {
      res.status(404).json({ error: 'That is not a building in this city.' })
      return
    }

    const existing = one<BuildingOverrideRow>(
      'SELECT * FROM building_overrides WHERE building_id = ?',
      id,
    )
    if (!existing) {
      res.status(400).json({ error: 'That building is already using the catalogue settings.' })
      return
    }

    run('DELETE FROM building_overrides WHERE building_id = ?', id)
    audit(req.user!.id, 'admin.world.building.reset', `Reset the building ${id} to the catalogue`)

    res.json({ ok: true })
  }),
)

/* ---------------------------------------------------------- the investors -- */

const INVESTOR_STAGE_VALUES: readonly string[] = INVESTOR_STAGES

const investorSchema = z.object({
  name: z.string().trim().min(2, 'Give the investor a name.').max(80),
  organisation: z.string().trim().max(120).default(''),
  stageFocus: z.string().trim().refine((v) => INVESTOR_STAGE_VALUES.includes(v), {
    message: 'Choose a stage this investor focuses on.',
  }),
  ticket: z.string().trim().max(60).default(''),
  sectors: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  active: z.boolean().default(true),
  notes: z.string().trim().max(600).default(''),
})

router.get(
  '/world/investors',
  wrap(async (_req, res) => {
    const rows = many<InvestorRow>('SELECT * FROM investors ORDER BY name ASC')
    res.json({
      investors: rows.map(toInvestor),
      total: rows.length,
      active: rows.filter((row) => row.active === 1).length,
    })
  }),
)

router.post(
  '/world/investors',
  wrap(async (req, res) => {
    const parsed = investorSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those details.' })
      return
    }

    const data = parsed.data
    const id = newId()
    const now = new Date().toISOString()

    run(
      `INSERT INTO investors
         (id, name, organisation, stage_focus, ticket, sectors, active, notes, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.name,
      data.organisation,
      data.stageFocus,
      data.ticket,
      JSON.stringify(data.sectors),
      data.active ? 1 : 0,
      data.notes,
      now,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.world.investor.create', `Added the investor ${data.name}`)

    const row = one<InvestorRow>('SELECT * FROM investors WHERE id = ?', id)
    res.status(201).json({ investor: row ? toInvestor(row) : null })
  }),
)

router.put(
  '/world/investors/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<InvestorRow>('SELECT * FROM investors WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That investor does not exist.' })
      return
    }

    const parsed = investorSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those details.' })
      return
    }

    const data = parsed.data
    const now = new Date().toISOString()

    run(
      `UPDATE investors
       SET name = ?, organisation = ?, stage_focus = ?, ticket = ?, sectors = ?, active = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      data.name,
      data.organisation,
      data.stageFocus,
      data.ticket,
      JSON.stringify(data.sectors),
      data.active ? 1 : 0,
      data.notes,
      now,
      id,
    )

    audit(req.user!.id, 'admin.world.investor.update', `Updated the investor ${data.name}`)

    const row = one<InvestorRow>('SELECT * FROM investors WHERE id = ?', id)
    res.json({ investor: row ? toInvestor(row) : null })
  }),
)

router.delete(
  '/world/investors/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<InvestorRow>('SELECT * FROM investors WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That investor does not exist.' })
      return
    }

    run('DELETE FROM investors WHERE id = ?', id)
    audit(req.user!.id, 'admin.world.investor.delete', `Removed the investor ${existing.name}`)

    res.json({ ok: true })
  }),
)

export default router
