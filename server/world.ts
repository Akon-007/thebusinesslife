/**
 * The controlled vocabulary of the city.
 *
 * The world — its districts, its buildings, its fourteen NPC roles and the
 * business sectors a player can choose — is authored in the player application
 * and stays the client's contract. What lives here is the *vocabulary* the
 * administrator's world routes validate against, exactly as `content.ts` does
 * for levels and missions.
 *
 * Nothing in this file moves the world: it names the parts so an override can
 * point at one.
 */

/* ----------------------------------------------------------------- roles -- */

export const NPC_ROLES = [
  'customer',
  'market_trader',
  'supplier',
  'business_owner',
  'employee',
  'mentor',
  'competitor',
  'bank_rep',
  'investor',
  'gov_official',
  'lawyer_accountant',
  'delivery',
  'service_provider',
  'resident',
] as const
export type NpcRole = (typeof NPC_ROLES)[number]

export const NPC_ROLE_LABELS: Record<NpcRole, string> = {
  customer: 'Customer',
  market_trader: 'Market Trader',
  supplier: 'Supplier',
  business_owner: 'Business Owner',
  employee: 'Employee',
  mentor: 'Mentor',
  competitor: 'Competitor',
  bank_rep: 'Bank Representative',
  investor: 'Investor',
  gov_official: 'Government Official',
  lawyer_accountant: 'Lawyer & Accountant',
  delivery: 'Delivery Personnel',
  service_provider: 'Service Provider',
  resident: 'City Resident',
}

export const NPC_ROLE_BLURBS: Record<NpcRole, string> = {
  customer: 'A potential buyer going about their day.',
  market_trader: 'Knows every price on this street.',
  supplier: 'Moves goods out of the warehouses.',
  business_owner: 'Has run a shop here for years.',
  employee: 'Looking for work, or already working.',
  mentor: 'Has built and sold companies before.',
  competitor: 'Runs a rival operation.',
  bank_rep: 'Handles business accounts and lending.',
  investor: 'Deploys capital into early-stage companies.',
  gov_official: 'Runs company registration and compliance.',
  lawyer_accountant: 'Keeps the paperwork and the numbers straight.',
  delivery: 'Moves goods across the city.',
  service_provider: 'Offers utilities and services to businesses.',
  resident: 'Lives here and knows the area.',
}

/* ------------------------------------------------------------- districts -- */

export interface DistrictRef {
  id: string
  name: string
}

export const DISTRICTS: DistrictRef[] = [
  { id: 'd_market', name: 'Balogun Market' },
  { id: 'd_commercial', name: 'Broad Street Commercial' },
  { id: 'd_business', name: 'Victoria Island Business District' },
  { id: 'd_residential', name: 'Yaba Residential' },
  { id: 'd_civic', name: 'Civic Centre' },
  { id: 'd_industrial', name: 'Apapa Industrial Area' },
]

export const DISTRICT_IDS: string[] = DISTRICTS.map((d) => d.id)

/* ------------------------------------------------------------- buildings -- */

export const BUILDING_TYPES = [
  'office',
  'bank',
  'registration_office',
  'market',
  'mall',
  'restaurant',
  'warehouse',
  'residential',
  'business_hub',
] as const

export interface BuildingRef {
  id: string
  name: string
  districtId: string
  type: string
}

export const BUILDINGS: BuildingRef[] = [
  { id: 'b_market_hall', name: 'Balogun Market Hall', districtId: 'd_market', type: 'market' },
  { id: 'b_textile_row', name: 'Oshodi Textile Row', districtId: 'd_market', type: 'market' },
  { id: 'b_canteen', name: 'Mama Nkechi Canteen', districtId: 'd_market', type: 'restaurant' },
  { id: 'b_broad_mall', name: 'Broad Street Mall', districtId: 'd_commercial', type: 'mall' },
  { id: 'b_lagoon_offices', name: 'Lagoon View Offices', districtId: 'd_commercial', type: 'office' },
  { id: 'b_first_continental', name: 'First Continental Bank', districtId: 'd_commercial', type: 'bank' },
  { id: 'b_idera_hub', name: 'Idera Business Hub', districtId: 'd_business', type: 'business_hub' },
  { id: 'b_ikoyi_tower', name: 'Ikoyi Tower', districtId: 'd_business', type: 'office' },
  { id: 'b_marina_capital', name: 'Marina Capital Bank', districtId: 'd_business', type: 'bank' },
  { id: 'b_vi_rooftop', name: 'VI Rooftop Lounge', districtId: 'd_business', type: 'restaurant' },
  { id: 'b_yaba_a', name: 'Yaba Estate Block A', districtId: 'd_residential', type: 'residential' },
  { id: 'b_yaba_b', name: 'Yaba Estate Block B', districtId: 'd_residential', type: 'residential' },
  { id: 'b_yaba_kitchen', name: 'Yaba Corner Kitchen', districtId: 'd_residential', type: 'restaurant' },
  { id: 'b_sabo_grocers', name: 'Sabo Provisions', districtId: 'd_residential', type: 'market' },
  { id: 'b_cac', name: 'Corporate Affairs Commission', districtId: 'd_civic', type: 'registration_office' },
  { id: 'b_firs', name: 'FIRS Tax Office', districtId: 'd_civic', type: 'office' },
  { id: 'b_cbn_annex', name: 'Central Bank Annex', districtId: 'd_civic', type: 'bank' },
  { id: 'b_civic_chambers', name: 'Ikeja Civic Chambers', districtId: 'd_civic', type: 'office' },
  { id: 'b_apapa_wh', name: 'Apapa Warehouse Complex', districtId: 'd_industrial', type: 'warehouse' },
  { id: 'b_tincan', name: 'Tin Can Port Depot', districtId: 'd_industrial', type: 'warehouse' },
  { id: 'b_park_offices', name: 'Industrial Park Offices', districtId: 'd_industrial', type: 'office' },
  { id: 'b_dangote_store', name: 'Dangote Distribution Store', districtId: 'd_industrial', type: 'warehouse' },
]

export const BUILDING_IDS: string[] = BUILDINGS.map((b) => b.id)

/* --------------------------------------------------------------- sectors -- */

/** The sectors offered to a player during business onboarding. */
export const SECTORS = [
  'Fashion & Apparel',
  'Food & Beverage',
  'Technology',
  'Retail & Trading',
  'Logistics & Transport',
  'Beauty & Wellness',
  'Agriculture',
  'Real Estate',
  'Entertainment & Media',
  'Education & Training',
]

/* ---------------------------------------------------------------- checks -- */

export function isNpcRole(value: string): value is NpcRole {
  return (NPC_ROLES as readonly string[]).includes(value)
}

export function isDistrictId(value: string): boolean {
  return DISTRICT_IDS.includes(value)
}

export function isBuildingId(value: string): boolean {
  return BUILDING_IDS.includes(value)
}

export function isSector(value: string): boolean {
  return SECTORS.includes(value)
}

export const INVESTOR_STAGES = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Growth',
  'Any stage',
] as const
export type InvestorStage = (typeof INVESTOR_STAGES)[number]

/** The vocabulary the world screens render their pickers from. */
export function worldVocabulary() {
  return {
    roles: NPC_ROLES.map((value) => ({
      value,
      label: NPC_ROLE_LABELS[value],
      blurb: NPC_ROLE_BLURBS[value],
    })),
    districts: DISTRICTS,
    buildings: BUILDINGS,
    buildingTypes: [...BUILDING_TYPES],
    sectors: [...SECTORS],
    investorStages: [...INVESTOR_STAGES],
  }
}

/* ------------------------------------------------------------------ rows -- */

export interface RoleOverrideRow {
  role: string
  spawn_count: number | null
  spawn_districts: string | null
  active: number | null
  updated_at: string
  updated_by: string | null
}

export interface SectorOverrideRow {
  sector: string
  active: number | null
  briefing: string | null
  updated_at: string
  updated_by: string | null
}

export interface DistrictOverrideRow {
  district_id: string
  active: number | null
  footfall: number | null
  notes: string | null
  updated_at: string
  updated_by: string | null
}

export interface BuildingOverrideRow {
  building_id: string
  active: number | null
  notes: string | null
  updated_at: string
  updated_by: string | null
}

export interface InvestorRow {
  id: string
  name: string
  organisation: string
  stage_focus: string
  ticket: string
  sectors: string
  active: number
  notes: string
  created_at: string
  updated_at: string
  created_by: string | null
}

/** A JSON list column, read defensively. `null` is preserved as "inherit". */
export function listOrNull(raw: string | null): string[] | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

export function toRoleOverride(row: RoleOverrideRow) {
  return {
    role: row.role,
    spawnCount: row.spawn_count,
    spawnDistricts: listOrNull(row.spawn_districts),
    active: row.active === null ? null : row.active === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function toSectorOverride(row: SectorOverrideRow) {
  return {
    sector: row.sector,
    active: row.active === null ? null : row.active === 1,
    briefing: row.briefing,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function toDistrictOverride(row: DistrictOverrideRow) {
  return {
    districtId: row.district_id,
    active: row.active === null ? null : row.active === 1,
    footfall: row.footfall,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function toBuildingOverride(row: BuildingOverrideRow) {
  return {
    buildingId: row.building_id,
    active: row.active === null ? null : row.active === 1,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function toInvestor(row: InvestorRow) {
  return {
    id: row.id,
    name: row.name,
    organisation: row.organisation,
    stageFocus: row.stage_focus,
    ticket: row.ticket,
    sectors: listOrNull(row.sectors) ?? [],
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}
