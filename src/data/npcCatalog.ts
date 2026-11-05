import type { InfoKind } from '../types/business'
import type { NPCRole } from '../types/npc'
import type { UnlockKey } from '../types/progression'
import type { BuildingType } from '../types/world'

/**
 * One thing the player can do with an NPC. Interactions are strictly
 * role-scoped, so a customer never offers loan terms and a bank rep never
 * offers to buy your product.
 */
export interface InteractionDef {
  id: string
  label: string
  /** One-line description shown under the label. */
  description: string
  /** What the NPC says back. */
  response: string
  /** Information this interaction adds to the player's records. */
  info?: { kind: InfoKind; label: string; detail: string; value?: number }
  /** Business action id fired when this interaction is used. */
  action?: string
  /** Only available once this feature is unlocked by a level. */
  requiresUnlock?: UnlockKey
  /** Only available from this level index onward. */
  minLevel?: number
  /** Cash cost to perform. */
  cost?: number
  /** XP granted. */
  xp?: number
  /** Cash granted (e.g. a deposit or an advance). */
  cash?: number
}

export interface RoleDef {
  role: NPCRole
  label: string
  /** Shown in the interaction panel header. */
  blurb: string
  /** UI accent colour for markers and panel highlights. */
  accent: string
  /** Appearance palettes so each role reads differently on the street. */
  shirtColors: string[]
  trousersColors: string[]
  hairColors: string[]
  skinColors: string[]
  /** Districts this role spawns in. */
  spawnDistricts: string[]
  /** How many of this role to seed into the city. */
  spawnCount: number
  /** Building types this role hangs around. */
  favouredBuildings: BuildingType[]
  names: string[]
  interactions: InteractionDef[]
}

const SKINS = ['#7a4a25', '#8d5524', '#5d3a1a', '#a9713f', '#4a2c14', '#94663a']
const HAIR = ['#1c1410', '#241a12', '#120d0a', '#2e2018']

export const ROLE_DEFS: RoleDef[] = [
  {
    role: 'customer',
    label: 'Customer',
    blurb: 'A potential buyer going about their day.',
    accent: '#38bdf8',
    shirtColors: ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'],
    trousersColors: ['#1f2937', '#334155', '#3f3f46', '#44403c'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_market', 'd_commercial', 'd_residential', 'd_business'],
    spawnCount: 16,
    favouredBuildings: ['market', 'mall', 'restaurant'],
    names: ['Tunde', 'Amina', 'Chidi', 'Folake', 'Bashir', 'Ifeoma', 'Seyi', 'Hauwa', 'Kunle', 'Adaeze'],
    interactions: [
      {
        id: 'introduce_business',
        label: 'Introduce your business',
        description: 'Tell them who you are and what you sell.',
        response: '"Okay, I hear you. So what exactly does it do for me?"',
        xp: 6,
      },
      {
        id: 'ask_needs',
        label: 'Ask about their needs',
        description: 'Find out what they actually struggle with.',
        response: '"Honestly? Transport is killing me. I need something faster and cheaper."',
        info: {
          kind: 'customer_need',
          label: 'Customer need',
          detail: 'Wants a faster, cheaper alternative to what they use today.',
        },
        xp: 8,
      },
      {
        id: 'customer_interview',
        label: 'Conduct a customer interview',
        description: 'A structured interview that produces usable research.',
        response:
          '"I buy from the market three times a week. I would pay more if someone delivered on time."',
        info: {
          kind: 'customer_need',
          label: 'Customer interview',
          detail: 'Will pay a premium for reliable, on-time delivery.',
        },
        xp: 12,
      },
      {
        id: 'purchasing_preferences',
        label: 'Understand purchasing preferences',
        description: 'Learn how they choose between options.',
        response: '"I check the price first, then quality. If it disappoints me once, I never come back."',
        info: {
          kind: 'customer_need',
          label: 'Purchasing preference',
          detail: 'Price-sensitive, but loyalty is won through consistent quality.',
        },
        xp: 10,
      },
      {
        id: 'offer_product',
        label: 'Offer a product or service',
        description: 'Try to make an actual sale.',
        requiresUnlock: 'launch',
        response: '"Let me try one. If it works, I will tell my people about it."',
        cash: 25000,
        xp: 20,
      },
    ],
  },

  {
    role: 'market_trader',
    label: 'Market Trader',
    blurb: 'Knows every price on this street.',
    accent: '#f59e0b',
    shirtColors: ['#b45309', '#92400e', '#a16207', '#78350f'],
    trousersColors: ['#292524', '#1c1917'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_market', 'd_residential'],
    spawnCount: 10,
    favouredBuildings: ['market'],
    names: ['Alhaja Sikira', 'Baba Wale', 'Mama Bose', 'Oga Emeka', 'Iya Risi', 'Alhaji Danjuma'],
    interactions: [
      {
        id: 'ask_market_price',
        label: 'Ask about product prices',
        description: 'Get the going rate for a product.',
        response: '"Today? A carton is ₦18,000. Last week it was ₦17,200. It keeps moving."',
        info: {
          kind: 'market_price',
          label: 'Market price',
          detail: 'Carton of goods trading at about ₦18,000 this week.',
          value: 18000,
        },
        xp: 10,
      },
      {
        id: 'ask_supplier_prices',
        label: 'Compare supplier prices',
        description: 'Find out who sells cheapest.',
        response: '"Do not buy from the front stalls. Go to Tin Can, you will save almost 12%."',
        info: {
          kind: 'supplier_quote',
          label: 'Supplier price comparison',
          detail: 'Tin Can suppliers are roughly 12% cheaper than market front stalls.',
          value: 12,
        },
        xp: 12,
      },
      {
        id: 'buy_sample',
        label: 'Buy a sample',
        description: 'Buy stock to inspect quality.',
        cost: 8000,
        response: '"Take am. Small thing for you."',
        xp: 6,
      },
    ],
  },

  {
    role: 'supplier',
    label: 'Supplier',
    blurb: 'Moves goods out of the warehouses.',
    accent: '#22c55e',
    shirtColors: ['#15803d', '#166534', '#3f6212', '#065f46'],
    trousersColors: ['#1f2937', '#292524', '#3f3f46'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_industrial', 'd_market'],
    spawnCount: 10,
    favouredBuildings: ['warehouse', 'market'],
    names: ['Mr. Okonkwo', 'Alhaji Musa', 'Chief Bello', 'Nnamdi', 'Yakubu', 'Godwin'],
    interactions: [
      {
        id: 'view_products',
        label: 'View available products',
        description: 'See what they can supply.',
        response: '"We carry cartons, sacks and bulk packaging. Minimum order is fifty units."',
        info: {
          kind: 'market_price',
          label: 'Product line',
          detail: 'Supplies cartons, sacks and bulk packaging from 50 units.',
        },
        xp: 8,
      },
      {
        id: 'compare_prices',
        label: 'Compare prices',
        description: 'Benchmark them against the market.',
        response: '"Market is ₦18,000 a carton. From my warehouse, ₦15,800 if you take fifty."',
        info: {
          kind: 'supplier_quote',
          label: 'Wholesale comparison',
          detail: 'Wholesale at ₦15,800/carton for 50+ units, versus ₦18,000 retail.',
          value: 15800,
        },
        xp: 12,
      },
      {
        id: 'negotiate_terms',
        label: 'Negotiate terms',
        description: 'Push for a better deal.',
        response: '"Pay 40% now, balance in thirty days. That is my final offer."',
        info: {
          kind: 'supplier_quote',
          label: 'Negotiated terms',
          detail: '40% deposit, balance on 30-day credit terms.',
          value: 15800,
        },
        xp: 16,
      },
      {
        id: 'request_quote',
        label: 'Request a quotation',
        description: 'Get a written quote for your business plan.',
        response: '"I will write it for you. Fifty cartons, ₦790,000, delivery included."',
        info: {
          kind: 'supplier_quote',
          label: 'Formal quotation',
          detail: '₦790,000 for 50 cartons including delivery.',
          value: 790000,
        },
        xp: 18,
      },
    ],
  },

  {
    role: 'business_owner',
    label: 'Business Owner',
    blurb: 'Has run a shop here for years.',
    accent: '#a855f7',
    shirtColors: ['#6d28d9', '#4c1d95', '#7e22ce', '#3730a3'],
    trousersColors: ['#1e293b', '#292524'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_commercial', 'd_business', 'd_market'],
    spawnCount: 10,
    favouredBuildings: ['office', 'mall', 'market', 'business_hub'],
    names: ['Chief Adeyemi', 'Mrs. Eze', 'Baba Nkechi', 'Oga Femi', 'Madam Grace', 'Chief Uche'],
    interactions: [
      {
        id: 'learn_competitors',
        label: 'Learn about competitors',
        description: 'Find out who else is in your space.',
        response:
          '"Two people are already doing this on Broad Street. One is cheaper, but their service is poor."',
        info: {
          kind: 'competitor_info',
          label: 'Competitor landscape',
          detail: 'Two established rivals; the cheaper one is weak on service.',
        },
        xp: 14,
      },
      {
        id: 'industry_experience',
        label: 'Ask about industry experience',
        description: 'Borrow hard-won lessons.',
        response: '"I started with one kiosk. Cash flow killed me twice before I learned to keep records."',
        info: {
          kind: 'industry_experience',
          label: 'Industry lesson',
          detail: 'Cash-flow discipline and record keeping decide who survives.',
        },
        xp: 12,
      },
      {
        id: 'discover_opportunity',
        label: 'Discover business opportunities',
        description: 'Ask where the gaps are.',
        response: '"Nobody delivers to the estates after 7pm. Whoever solves that will eat well."',
        info: {
          kind: 'opportunity',
          label: 'Business opportunity',
          detail: 'Unserved evening delivery demand in the residential estates.',
        },
        xp: 14,
      },
      {
        id: 'ask_premises',
        label: 'Ask about available premises',
        description: 'Find a shop front to lease.',
        minLevel: 6,
        action: 'lease_premises',
        cost: 40000,
        response: '"My neighbour is moving out. The landlord wants ₦40,000 for the year. Take it fast."',
        xp: 30,
      },
    ],
  },

  {
    role: 'employee',
    label: 'Employee',
    blurb: 'Looking for work, or already working.',
    accent: '#0ea5e9',
    shirtColors: ['#0369a1', '#0f766e', '#4338ca', '#065f46', '#7c2d12'],
    trousersColors: ['#1f2937', '#374151', '#292524'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_commercial', 'd_business', 'd_civic', 'd_industrial'],
    spawnCount: 12,
    favouredBuildings: ['office', 'business_hub', 'warehouse', 'mall'],
    names: ['Blessing', 'Ibrahim', 'Chinelo', 'Segun', 'Halima', 'Peter', 'Ngozi', 'Musa'],
    interactions: [
      {
        id: 'discuss_employment',
        label: 'Discuss employment',
        description: 'Talk about what they are looking for.',
        response: '"I want steady work with a fair salary. I do not mind starting small."',
        xp: 8,
      },
      {
        id: 'review_qualifications',
        label: 'Review qualifications',
        description: 'Assess what they would bring to your team.',
        response: '"I ran sales for a small shop for four years. I can hold a customer and close a deal."',
        info: {
          kind: 'candidate_profile',
          label: 'Candidate profile',
          detail: 'Four years of retail sales experience; strong at closing.',
        },
        xp: 16,
      },
      {
        id: 'assign_responsibilities',
        label: 'Assign responsibilities',
        description: 'Give them a role once hired.',
        requiresUnlock: 'hire_team',
        response: '"Consider it done. Give me the week and I will show you numbers."',
        xp: 10,
      },
    ],
  },

  {
    role: 'mentor',
    label: 'Mentor',
    blurb: 'Has built and sold companies before.',
    accent: '#eab308',
    shirtColors: ['#78350f', '#1e3a8a', '#111827', '#3f3f46'],
    trousersColors: ['#1f2937', '#111827', '#334155'],
    hairColors: ['#3f3f46', '#52525b', '#27272a'],
    skinColors: SKINS,
    spawnDistricts: ['d_business', 'd_civic'],
    spawnCount: 5,
    favouredBuildings: ['business_hub', 'office'],
    names: ['Dr. Okafor', 'Mrs. Alabi', 'Prof. Ibrahim', 'Mr. Danladi', 'Engr. Nwosu'],
    interactions: [
      {
        id: 'ask_advice',
        label: 'Ask for advice',
        description: 'Get guidance on your next move.',
        response:
          '"Stop polishing the idea. Go and find ten people who will actually pay. That is the whole game."',
        info: {
          kind: 'mentorship_advice',
          label: 'Mentorship advice',
          detail: 'Validate with paying customers before building anything.',
        },
        xp: 20,
      },
      {
        id: 'validate_idea',
        label: 'Validate your idea',
        description: 'Pressure-test the idea with someone experienced.',
        response:
          '"The idea is fine. Your timing is the risk. Do you know your unit economics? Learn them."',
        info: {
          kind: 'mentorship_advice',
          label: 'Idea validation',
          detail: 'Idea is sound but requires clear unit economics before scaling.',
        },
        xp: 22,
      },
    ],
  },

  {
    role: 'competitor',
    label: 'Competitor',
    blurb: 'Runs a rival operation.',
    accent: '#ef4444',
    shirtColors: ['#b91c1c', '#7f1d1d', '#991b1b'],
    trousersColors: ['#18181b', '#292524'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_commercial', 'd_market', 'd_business'],
    spawnCount: 7,
    favouredBuildings: ['office', 'market', 'mall'],
    names: ['Oga Rasheed', 'Madam Cynthia', 'Chukwudi', 'Tayo', 'Efe'],
    interactions: [
      {
        id: 'size_up',
        label: 'Size up their operation',
        description: 'See how big they really are.',
        response: '"We move about three hundred units a month. You are not a threat yet."',
        info: {
          kind: 'competitor_info',
          label: 'Competitor volume',
          detail: 'Rival moves roughly 300 units a month.',
          value: 300,
        },
        xp: 14,
      },
      {
        id: 'ask_pricing',
        label: 'Ask about their pricing',
        description: 'Get their price points.',
        response: '"We sell at ₦17,500. We do not compete on price, we compete on trust."',
        info: {
          kind: 'competitor_info',
          label: 'Competitor pricing',
          detail: 'Rival prices at ₦17,500 and competes on trust, not price.',
          value: 17500,
        },
        xp: 14,
      },
    ],
  },

  {
    role: 'bank_rep',
    label: 'Bank Representative',
    blurb: 'Handles business accounts and lending.',
    accent: '#14b8a6',
    shirtColors: ['#0f766e', '#115e59', '#1e3a8a', '#334155'],
    trousersColors: ['#0f172a', '#1f2937'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_civic', 'd_commercial', 'd_business'],
    spawnCount: 6,
    favouredBuildings: ['bank'],
    names: ['Mr. Adewale', 'Ms. Chukwu', 'Mr. Salami', 'Mrs. Ojo', 'Mr. Ikenna'],
    interactions: [
      {
        id: 'ask_loan_terms',
        label: 'Ask about loan terms',
        description: 'Learn what the bank will actually offer.',
        response:
          '"SME facility: 24% per annum, six-month moratorium, and we will want your books and a guarantor."',
        info: {
          kind: 'funding_terms',
          label: 'Loan terms',
          detail: 'SME loan at 24% p.a. with 6-month moratorium; needs books and a guarantor.',
          value: 24,
        },
        xp: 18,
      },
      {
        id: 'discuss_collateral',
        label: 'Discuss collateral',
        description: 'Find out what security they need.',
        response: '"Without collateral, we cannot move. With a track record, we can look at cash-flow lending."',
        info: {
          kind: 'funding_terms',
          label: 'Collateral requirement',
          detail: 'Cash-flow lending possible only after a documented trading track record.',
        },
        xp: 16,
      },
      {
        id: 'open_account',
        label: 'Open a business account',
        description: 'Get your company banking set up.',
        action: 'open_bank_account',
        response: '"Bring your registration certificate and two directors. I will open it today."',
        xp: 30,
      },
    ],
  },

  {
    role: 'investor',
    label: 'Investor',
    blurb: 'Deploys capital into early-stage companies.',
    accent: '#8b5cf6',
    shirtColors: ['#1e293b', '#0f172a', '#312e81', '#4c1d95'],
    trousersColors: ['#0f172a', '#111827'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_business'],
    spawnCount: 8,
    favouredBuildings: ['business_hub', 'office', 'restaurant'],
    names: ['Mr. Balogun', 'Mrs. Adeoti', 'Chief Ogunlesi', 'Ms. Nwachukwu', 'Mr. Oni', 'Dr. Suleiman'],
    interactions: [
      {
        id: 'introduce_company',
        label: 'Introduce your company',
        description: 'A short, low-risk introduction.',
        response: '"Nice to meet you. What stage are you at, and who is already paying you?"',
        xp: 10,
      },
      {
        id: 'present_idea',
        label: 'Present your business idea',
        description: 'Walk them through the opportunity.',
        response: '"Interesting. Market is real. I want to see traction before I commit capital."',
        info: {
          kind: 'investment_interest',
          label: 'Initial interest',
          detail: 'Interested but needs demonstrated traction first.',
        },
        xp: 20,
      },
      {
        id: 'request_meeting',
        label: 'Request a meeting',
        description: 'Get time in their calendar.',
        response: '"Come to my office in Victoria Island on Thursday. Bring your numbers."',
        xp: 16,
      },
      {
        id: 'pitch',
        label: 'Pitch your business',
        description: 'Deliver the full pitch for funding.',
        requiresUnlock: 'pitch',
        response:
          '"You handled that well. I am in for pre-seed, subject to due diligence. Let us talk terms."',
        info: {
          kind: 'investment_interest',
          label: 'Pitch outcome',
          detail: 'Investor indicated conditional interest for a pre-seed round.',
        },
        xp: 45,
      },
    ],
  },

  {
    role: 'gov_official',
    label: 'Government Official',
    blurb: 'Runs company registration and compliance.',
    accent: '#64748b',
    shirtColors: ['#334155', '#1e40af', '#475569', '#1f2937'],
    trousersColors: ['#0f172a', '#1f2937'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_civic'],
    spawnCount: 6,
    favouredBuildings: ['registration_office', 'office'],
    names: ['Mr. Oyelaran', 'Mrs. Bassey', 'Mr. Garba', 'Ms. Ilo', 'Mr. Ojo'],
    interactions: [
      {
        id: 'ask_registration',
        label: 'Ask about registration',
        description: 'Find out how to register your company.',
        response:
          '"You need a unique name, your ID, and a registered address. Registration takes five working days."',
        info: {
          kind: 'requirement_info',
          label: 'Registration requirement',
          detail: 'Unique name, valid ID and a registered address; 5 working days.',
        },
        xp: 14,
      },
      {
        id: 'ask_requirements',
        label: 'Ask about compliance requirements',
        description: 'Get the full list of conditions.',
        response:
          '"After incorporation you must file annual returns and register with FIRS for tax."',
        info: {
          kind: 'requirement_info',
          label: 'Compliance requirement',
          detail: 'Annual returns filing and FIRS tax registration required post-incorporation.',
        },
        xp: 14,
      },
      {
        id: 'ask_requirements_2',
        label: 'Ask about permits',
        description: 'What else will the state demand?',
        response: '"For a shop front you will need a state business permit and signage approval."',
        info: {
          kind: 'requirement_info',
          label: 'Permit requirement',
          detail: 'State business permit and signage approval needed for premises.',
        },
        xp: 14,
      },
      {
        id: 'register_company',
        label: 'Register your company',
        description: 'File the incorporation paperwork.',
        requiresUnlock: 'company_registration',
        action: 'register_company',
        cost: 25000,
        response: '"Everything is in order. Your certificate will be ready shortly."',
        xp: 40,
      },
      {
        id: 'complete_registration',
        label: 'Complete your registration',
        description: 'Close out all outstanding conditions.',
        minLevel: 5,
        action: 'complete_registration',
        response: '"Stamped and filed. You are fully compliant."',
        xp: 40,
      },
    ],
  },

  {
    role: 'lawyer_accountant',
    label: 'Lawyer & Accountant',
    blurb: 'Keeps the paperwork and the numbers straight.',
    accent: '#0d9488',
    shirtColors: ['#0f766e', '#1e293b', '#312e81', '#292524'],
    trousersColors: ['#0f172a', '#1f2937'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_civic', 'd_business'],
    spawnCount: 6,
    favouredBuildings: ['office', 'business_hub', 'registration_office'],
    names: ['Barr. Adekunle', 'Mr. Uzoma (ACA)', 'Barr. Sadiq', 'Mrs. Olaniyan', 'Barr. Eze'],
    interactions: [
      {
        id: 'ask_compliance',
        label: 'Ask about compliance',
        description: 'Get your legal obligations straight.',
        response: '"Keep a minute book, file annual returns, and never sign a personal guarantee."',
        info: {
          kind: 'requirement_info',
          label: 'Legal compliance',
          detail: 'Maintain a minute book, file annual returns, avoid personal guarantees.',
        },
        xp: 16,
      },
      {
        id: 'ask_bookkeeping',
        label: 'Ask about bookkeeping',
        description: 'How to present your numbers to investors.',
        response: '"Separate your personal money from the business today. Investors smell mixed accounts."',
        info: {
          kind: 'mentorship_advice',
          label: 'Financial discipline',
          detail: 'Separate personal and business finances; keep clean books for diligence.',
        },
        xp: 16,
      },
    ],
  },

  {
    role: 'delivery',
    label: 'Delivery Personnel',
    blurb: 'Moves goods across the city.',
    accent: '#f97316',
    shirtColors: ['#c2410c', '#ea580c', '#b45309', '#a16207'],
    trousersColors: ['#1f2937', '#292524'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_industrial', 'd_commercial', 'd_market'],
    spawnCount: 8,
    favouredBuildings: ['warehouse', 'market', 'mall'],
    names: ['Rider Sule', 'Rider Ifeanyi', 'Rider Bola', 'Rider Musa', 'Rider Chika'],
    interactions: [
      {
        id: 'ask_logistics',
        label: 'Ask about logistics',
        description: 'Find out what delivery costs.',
        response: '"Island to Mainland is ₦3,500 per drop. Same-day if you give me the load before noon."',
        info: {
          kind: 'supplier_quote',
          label: 'Logistics quote',
          detail: '₦3,500 per cross-city drop, same-day if loaded before noon.',
          value: 3500,
        },
        xp: 12,
      },
      {
        id: 'arrange_delivery',
        label: 'Arrange a delivery contract',
        description: 'Set up ongoing delivery for your business.',
        action: 'arrange_delivery',
        cost: 60000,
        response: '"I will be at your shop every morning. Do not worry about it."',
        xp: 20,
      },
    ],
  },

  {
    role: 'service_provider',
    label: 'Service Provider',
    blurb: 'Offers utilities and services to businesses.',
    accent: '#db2777',
    shirtColors: ['#be185d', '#9d174d', '#831843', '#7c2d12'],
    trousersColors: ['#1f2937', '#292524', '#3f3f46'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_commercial', 'd_residential', 'd_market'],
    spawnCount: 8,
    favouredBuildings: ['office', 'mall', 'market', 'restaurant'],
    names: ['Mr. Kanu', 'Aunty Shade', 'Hassan', 'Mr. Paul', 'Madam Rita'],
    interactions: [
      {
        id: 'ask_service_prices',
        label: 'Ask about service prices',
        description: 'Get rates for business services.',
        response: '"Branding and signage? ₦85,000 for a proper shop front. Generator servicing is ₦20,000 a month."',
        info: {
          kind: 'market_price',
          label: 'Service pricing',
          detail: 'Shop signage ₦85,000; generator servicing ₦20,000/month.',
          value: 85000,
        },
        xp: 12,
      },
      {
        id: 'book_service',
        label: 'Book a service',
        description: 'Engage them for your premises.',
        action: 'book_service',
        cost: 85000,
        response: '"I will come and measure tomorrow morning. You will like the finish."',
        xp: 18,
      },
    ],
  },

  {
    role: 'resident',
    label: 'City Resident',
    blurb: 'Lives here and knows the area.',
    accent: '#94a3b8',
    shirtColors: ['#475569', '#525252', '#3f6212', '#7f1d1d', '#1e40af'],
    trousersColors: ['#1f2937', '#292524', '#374151'],
    hairColors: HAIR,
    skinColors: SKINS,
    spawnDistricts: ['d_residential', 'd_market', 'd_civic', 'd_commercial'],
    spawnCount: 14,
    favouredBuildings: ['residential', 'restaurant', 'mall'],
    names: ['Aunty Titi', 'Baba Sunday', 'Nkechi', 'Yusuf', 'Madam Kudi', 'Oga Ben', 'Aisha'],
    interactions: [
      {
        id: 'small_talk',
        label: 'Make small talk',
        description: 'A friendly word on the street.',
        response: '"Ah, you are the new person in the market! Welcome. Lagos is not easy, but it is fair."',
        xp: 4,
      },
      {
        id: 'ask_neighbourhood',
        label: 'Ask about the neighbourhood',
        description: 'Learn what is happening nearby.',
        response: '"They are building new shops near the estate. Plenty of people, no one serving them well."',
        info: {
          kind: 'opportunity',
          label: 'Neighbourhood insight',
          detail: 'New shops by the estate create demand with weak existing service.',
        },
        xp: 8,
      },
    ],
  },
]

export const ROLE_BY_ID = Object.fromEntries(ROLE_DEFS.map((r) => [r.role, r])) as Record<
  NPCRole,
  RoleDef
>

/** All interactions available for a role, before unlock/level gating. */
export function roleInteractions(role: NPCRole): InteractionDef[] {
  return ROLE_BY_ID[role].interactions
}

export function findInteraction(role: NPCRole, interactionId: string): InteractionDef | undefined {
  return ROLE_BY_ID[role].interactions.find((i) => i.id === interactionId)
}

/**
 * The contextual gate. An interaction is offered only if the role has it, the
 * required feature is unlocked, and the player is far enough along.
 */
export function isInteractionAvailable(
  def: InteractionDef,
  ctx: { levelIndex: number; unlocks: string[] },
): boolean {
  if (def.requiresUnlock && !ctx.unlocks.includes(def.requiresUnlock)) return false
  if (def.minLevel && ctx.levelIndex < def.minLevel) return false
  return true
}
