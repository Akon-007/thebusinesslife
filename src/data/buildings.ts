import type { Building, District } from '../types/world'

/**
 * The districts of the Lagos-inspired city, laid out on a 3x2 grid with
 * connecting roads. Coordinates are world-space metres.
 */
export const DISTRICTS: District[] = [
  {
    id: 'd_market',
    name: 'Balogun Market',
    short: 'Balogun',
    theme: 'market',
    center: [-110, -110],
    size: [42, 42],
    groundColor: '#b9a37c',
  },
  {
    id: 'd_commercial',
    name: 'Broad Street Commercial',
    short: 'Broad St',
    theme: 'commercial',
    center: [0, -110],
    size: [42, 42],
    groundColor: '#aca599',
  },
  {
    id: 'd_business',
    name: 'Victoria Island Business District',
    short: 'V.I.',
    theme: 'business_district',
    center: [110, -110],
    size: [42, 42],
    groundColor: '#9aa4ae',
  },
  {
    id: 'd_residential',
    name: 'Yaba Residential',
    short: 'Yaba',
    theme: 'residential',
    center: [-110, 110],
    size: [42, 42],
    groundColor: '#93a37e',
  },
  {
    id: 'd_civic',
    name: 'Civic Centre',
    short: 'Civic',
    theme: 'civic',
    center: [0, 110],
    size: [42, 42],
    groundColor: '#a9a3b9',
  },
  {
    id: 'd_industrial',
    name: 'Apapa Industrial Area',
    short: 'Apapa',
    theme: 'industrial',
    center: [110, 110],
    size: [42, 42],
    groundColor: '#a3978b',
  },
]

const D = Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<string, District>

/** Places a building at `district centre + offset`. */
function at(districtId: string, ox: number, oz: number): [number, number, number] {
  const d = D[districtId]
  return [d.center[0] + ox, 0, d.center[1] + oz]
}

/**
 * Hand-authored buildings with Nigerian signage. These are the meaningful,
 * interactive locations of the city.
 */
export const BUILDINGS: Building[] = [
  // --- Balogun Market ---
  {
    id: 'b_market_hall', districtId: 'd_market', type: 'market', name: 'Balogun Market Hall',
    position: at('d_market', 0, -20), size: [46, 14, 26], rotationY: 0,
    color: '#c9a227', roofColor: '#8d5b2b', sign: 'BALOGUN MARKET',
  },
  {
    id: 'b_textile_row', districtId: 'd_market', type: 'market', name: 'Oshodi Textile Row',
    position: at('d_market', -26, 16), size: [22, 10, 22], rotationY: 0,
    color: '#c2703b', roofColor: '#6b4a2a', sign: 'TEXTILE ROW',
  },
  {
    id: 'b_canteen', districtId: 'd_market', type: 'restaurant', name: 'Mama Nkechi Canteen',
    position: at('d_market', 26, 16), size: [20, 9, 20], rotationY: 0,
    color: '#d9c27a', roofColor: '#7a4b2b', sign: 'MAMA NKECHI',
  },

  // --- Broad Street Commercial ---
  {
    id: 'b_broad_mall', districtId: 'd_commercial', type: 'mall', name: 'Broad Street Mall',
    position: at('d_commercial', 0, -18), size: [46, 20, 28], rotationY: 0,
    color: '#cfd4d8', roofColor: '#5f6b73', sign: 'BROAD ST MALL',
  },
  {
    id: 'b_lagoon_offices', districtId: 'd_commercial', type: 'office', name: 'Lagoon View Offices',
    position: at('d_commercial', -26, 18), size: [22, 26, 22], rotationY: 0,
    color: '#8fa8bf', roofColor: '#3f556b', sign: 'LAGOON VIEW',
  },
  {
    id: 'b_first_continental', districtId: 'd_commercial', type: 'bank', name: 'First Continental Bank',
    position: at('d_commercial', 26, 18), size: [22, 18, 22], rotationY: 0,
    color: '#e0d6c3', roofColor: '#7b6a4f', sign: 'FIRST CONTINENTAL',
  },

  // --- Victoria Island Business District ---
  {
    id: 'b_idera_hub', districtId: 'd_business', type: 'business_hub', name: 'Idera Business Hub',
    position: at('d_business', 0, -18), size: [46, 24, 28], rotationY: 0,
    color: '#7f8fa6', roofColor: '#2f3d4f', sign: 'IDERA HUB',
  },
  {
    id: 'b_ikoyi_tower', districtId: 'd_business', type: 'office', name: 'Ikoyi Tower',
    position: at('d_business', -26, 18), size: [22, 40, 22], rotationY: 0,
    color: '#9fb3c8', roofColor: '#2b3846', sign: 'IKOYI TOWER',
  },
  {
    id: 'b_marina_capital', districtId: 'd_business', type: 'bank', name: 'Marina Capital Bank',
    position: at('d_business', 26, 18), size: [22, 20, 22], rotationY: 0,
    color: '#dcd3c0', roofColor: '#6d5c42', sign: 'MARINA CAPITAL',
  },
  {
    id: 'b_vi_rooftop', districtId: 'd_business', type: 'restaurant', name: 'VI Rooftop Lounge',
    position: at('d_business', 0, 20), size: [22, 10, 22], rotationY: 0,
    color: '#c98f4e', roofColor: '#6f4a2a', sign: 'VI ROOFTOP',
  },

  // --- Yaba Residential ---
  {
    id: 'b_yaba_a', districtId: 'd_residential', type: 'residential', name: 'Yaba Estate Block A',
    position: at('d_residential', -24, -16), size: [24, 18, 26], rotationY: 0,
    color: '#d3c3a4', roofColor: '#8b5e3c', sign: 'BLOCK A',
  },
  {
    id: 'b_yaba_b', districtId: 'd_residential', type: 'residential', name: 'Yaba Estate Block B',
    position: at('d_residential', 24, -16), size: [24, 18, 26], rotationY: 0,
    color: '#cbb99b', roofColor: '#8b5e3c', sign: 'BLOCK B',
  },
  {
    id: 'b_yaba_kitchen', districtId: 'd_residential', type: 'restaurant', name: 'Yaba Corner Kitchen',
    position: at('d_residential', -24, 18), size: [22, 9, 22], rotationY: 0,
    color: '#c98f4e', roofColor: '#6f4a2a', sign: 'CORNER KITCHEN',
  },
  {
    id: 'b_sabo_grocers', districtId: 'd_residential', type: 'market', name: 'Sabo Provisions',
    position: at('d_residential', 24, 18), size: [22, 10, 22], rotationY: 0,
    color: '#b9a06a', roofColor: '#6b4a2a', sign: 'SABO PROVISIONS',
  },

  // --- Civic Centre ---
  {
    id: 'b_cac', districtId: 'd_civic', type: 'registration_office', name: 'Corporate Affairs Commission',
    position: at('d_civic', 0, -18), size: [46, 20, 28], rotationY: 0,
    color: '#cdd7e2', roofColor: '#41576e', sign: 'CAC REGISTRY',
  },
  {
    id: 'b_firs', districtId: 'd_civic', type: 'office', name: 'FIRS Tax Office',
    position: at('d_civic', -26, 18), size: [22, 22, 22], rotationY: 0,
    color: '#d8cfc0', roofColor: '#5a4c3c', sign: 'FIRS OFFICE',
  },
  {
    id: 'b_cbn_annex', districtId: 'd_civic', type: 'bank', name: 'Central Bank Annex',
    position: at('d_civic', 26, 18), size: [22, 18, 22], rotationY: 0,
    color: '#e3dccb', roofColor: '#6b5a40', sign: 'CBN ANNEX',
  },
  {
    id: 'b_civic_chambers', districtId: 'd_civic', type: 'office', name: 'Ikeja Civic Chambers',
    position: at('d_civic', 0, 20), size: [22, 16, 22], rotationY: 0,
    color: '#bcc4cc', roofColor: '#4a545c', sign: 'CIVIC CHAMBERS',
  },

  // --- Apapa Industrial ---
  {
    id: 'b_apapa_wh', districtId: 'd_industrial', type: 'warehouse', name: 'Apapa Warehouse Complex',
    position: at('d_industrial', -26, -16), size: [34, 16, 26], rotationY: 0,
    color: '#a8988a', roofColor: '#4f463c', sign: 'APAPA WAREHOUSE',
  },
  {
    id: 'b_tincan', districtId: 'd_industrial', type: 'warehouse', name: 'Tin Can Port Depot',
    position: at('d_industrial', 26, -16), size: [30, 14, 26], rotationY: 0,
    color: '#9e8e80', roofColor: '#463d34', sign: 'TIN CAN DEPOT',
  },
  {
    id: 'b_park_offices', districtId: 'd_industrial', type: 'office', name: 'Industrial Park Offices',
    position: at('d_industrial', -26, 18), size: [22, 18, 22], rotationY: 0,
    color: '#b2b8bd', roofColor: '#4a545c', sign: 'PARK OFFICES',
  },
  {
    id: 'b_dangote_store', districtId: 'd_industrial', type: 'warehouse', name: 'Dangote Distribution Store',
    position: at('d_industrial', 26, 18), size: [26, 16, 22], rotationY: 0,
    color: '#b09a86', roofColor: '#4a4038', sign: 'DANGOTE DIST.',
  },
]

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<
  string,
  Building
>

export const DISTRICT_BY_ID = D

export function buildingsByType(type: Building['type']): Building[] {
  return BUILDINGS.filter((b) => b.type === type)
}

export function buildingsByDistrict(districtId: string): Building[] {
  return BUILDINGS.filter((b) => b.districtId === districtId)
}

export function firstBuildingOfType(type: Building['type']): Building | undefined {
  return BUILDINGS.find((b) => b.type === type)
}
