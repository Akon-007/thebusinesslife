import { api } from '../../api/client'

/**
 * The shapes the world screens work with.
 *
 * As with the content screens, the world catalogue itself — districts,
 * buildings, NPC roles, sector names — is a client contract held by the player
 * application. What the API returns here is the catalogue *plus* any override an
 * administrator has saved, so the screens can show both side by side and a
 * reset is simply a delete.
 */

/* ------------------------------------------------------------------ NPCs -- */

export interface RoleOverrideRecord {
  role: string
  spawnCount: number | null
  spawnDistricts: string[] | null
  active: boolean | null
  updatedAt: string
  updatedBy: string | null
}

export interface RoleRow {
  value: string
  label: string
  blurb: string
  override: RoleOverrideRecord | null
  /** Authored mission objectives that require talking to this role. */
  requiredByMissions: number
}

export interface NpcsPayload {
  roles: RoleRow[]
  overridden: number
  totalRoles: number
}

/* --------------------------------------------------------------- sectors -- */

export interface SectorOverrideRecord {
  sector: string
  active: boolean | null
  briefing: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface SectorRow {
  sector: string
  override: SectorOverrideRecord | null
  companies: number
  players: number
  averageLevel: number
}

export interface SectorsPayload {
  sectors: SectorRow[]
  overridden: number
  totalSectors: number
}

/* ------------------------------------------------------------- the city -- */

export interface DistrictOverrideRecord {
  districtId: string
  active: boolean | null
  footfall: number | null
  notes: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface DistrictRow {
  id: string
  name: string
  override: DistrictOverrideRecord | null
  buildingCount: number
}

export interface BuildingOverrideRecord {
  buildingId: string
  active: boolean | null
  notes: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface BuildingRow {
  id: string
  name: string
  districtId: string
  type: string
  override: BuildingOverrideRecord | null
  /** Authored mission objectives that send the player to this kind of place. */
  requiredByMissions: number
}

export interface CityPayload {
  districts: DistrictRow[]
  buildings: BuildingRow[]
  overriddenDistricts: number
  overriddenBuildings: number
}

/* ----------------------------------------------------------- the investors -- */

export interface InvestorRecord {
  id: string
  name: string
  organisation: string
  stageFocus: string
  ticket: string
  sectors: string[]
  active: boolean
  notes: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export interface InvestorsPayload {
  investors: InvestorRecord[]
  total: number
  active: number
}

export interface InvestorDraft {
  name: string
  organisation: string
  stageFocus: string
  ticket: string
  sectors: string[]
  active: boolean
  notes: string
}

/* ------------------------------------------------------------- vocabulary -- */

export interface WorldVocabulary {
  roles: { value: string; label: string; blurb: string }[]
  districts: { id: string; name: string }[]
  buildings: { id: string; name: string; districtId: string; type: string }[]
  buildingTypes: string[]
  sectors: string[]
  investorStages: string[]
}

export function fetchWorldVocabulary(): Promise<WorldVocabulary> {
  return api<WorldVocabulary>('/admin/world/meta')
}

/** `service_provider` reads as "service provider" in a sentence. */
export function humaniseToken(value: string): string {
  return value.replace(/_/g, ' ')
}

export function districtName(vocabulary: WorldVocabulary | null, districtId: string): string {
  return vocabulary?.districts.find((d) => d.id === districtId)?.name ?? districtId
}

export function emptyInvestorDraft(vocabulary: WorldVocabulary | null): InvestorDraft {
  return {
    name: '',
    organisation: '',
    stageFocus: vocabulary?.investorStages[0] ?? 'Any stage',
    ticket: '',
    sectors: [],
    active: true,
    notes: '',
  }
}

export function draftFromInvestor(investor: InvestorRecord): InvestorDraft {
  return {
    name: investor.name,
    organisation: investor.organisation,
    stageFocus: investor.stageFocus,
    ticket: investor.ticket,
    sectors: investor.sectors,
    active: investor.active,
    notes: investor.notes,
  }
}

export function investorDraftToPayload(draft: InvestorDraft) {
  return {
    name: draft.name.trim(),
    organisation: draft.organisation.trim(),
    stageFocus: draft.stageFocus,
    ticket: draft.ticket.trim(),
    sectors: draft.sectors,
    active: draft.active,
    notes: draft.notes.trim(),
  }
}
