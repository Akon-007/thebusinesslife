import { one } from './db'

/**
 * The controlled vocabulary of the classroom.
 *
 * A lecturer never needs to understand the simulation engine, so everything the
 * lecturer portal offers is named here: the ten assessment dimensions, the
 * assignment lifecycle, the scenario templates and the classroom events. The
 * lecturer routes validate against these lists, exactly as the administrator
 * routes validate against `simulation.ts`.
 */

/* ------------------------------------------------------ assessment framework -- */

/**
 * The ten dimensions a lecturer grades against.
 *
 * This is deliberately not XP, company value or cash: the specification is
 * explicit that the quality of a student's decisions is what is assessed, and
 * these are the dimensions that capture it.
 */
export const ASSESSMENT_DIMENSIONS = [
  { key: 'business_planning', label: 'Business planning' },
  { key: 'market_research', label: 'Market research' },
  { key: 'financial_management', label: 'Financial management' },
  { key: 'operational_decisions', label: 'Operational decisions' },
  { key: 'customer_management', label: 'Customer management' },
  { key: 'employee_management', label: 'Employee management' },
  { key: 'investment_readiness', label: 'Investment readiness' },
  { key: 'strategic_thinking', label: 'Strategic decision-making' },
  { key: 'adaptability', label: 'Adaptability to economic events' },
  { key: 'overall_performance', label: 'Overall business performance' },
] as const

export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number]['key']

const DIMENSION_KEYS = ASSESSMENT_DIMENSIONS.map((d) => d.key) as readonly string[]

export function isDimension(value: unknown): value is AssessmentDimension {
  return typeof value === 'string' && DIMENSION_KEYS.includes(value)
}

/** A 0–100 mark, read defensively. Anything unusable is dropped. */
export function parseScores(raw: string | null): Partial<Record<AssessmentDimension, number>> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Partial<Record<AssessmentDimension, number>> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isDimension(key)) continue
      const num = typeof value === 'number' ? value : Number(value)
      if (Number.isFinite(num) && num >= 0 && num <= 100) out[key] = num
    }
    return out
  } catch {
    return {}
  }
}

/** The mean of the dimensions a lecturer actually marked. */
export function averageScore(scores: Partial<Record<AssessmentDimension, number>>): number | null {
  const values = Object.values(scores).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The grade band used across the portal.
 *
 * Standard Nigerian university bands, so a mark means the same thing whether it
 * was written by hand or derived from the assessment dimensions.
 */
export function gradeFor(score: number): string {
  if (score >= 70) return 'A'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C'
  if (score >= 45) return 'D'
  if (score >= 40) return 'E'
  return 'F'
}

/* ------------------------------------------------------------------ classes -- */

export const CLASS_STATUSES = ['ACTIVE', 'ARCHIVED'] as const
export const MEMBER_STATUSES = ['PENDING', 'ACTIVE', 'REMOVED'] as const

export interface ClassRow {
  id: string
  lecturer_id: string
  name: string
  description: string
  term: string
  invite_code: string
  status: string
  starts_on: string | null
  ends_on: string | null
  simulation_paused: number
  created_at: string
  updated_at: string
}

export function toClass(row: ClassRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    term: row.term,
    inviteCode: row.invite_code,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    simulationPaused: row.simulation_paused === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** A six-character code a student can be given to join a class. */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  // Collisions are vanishingly rare, but the column is unique, so retry.
  if (one<{ id: string }>('SELECT id FROM classes WHERE invite_code = ?', code)) {
    return generateInviteCode()
  }
  return code
}

/* -------------------------------------------------------------- assignments -- */

export const ASSIGNMENT_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const
export const SUBMISSION_STATUSES = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'GRADED'] as const

export interface AssignmentRow {
  id: string
  class_id: string
  lecturer_id: string
  title: string
  instructions: string
  stage_index: number
  level_id: string | null
  mission_id: string | null
  learning_objectives: string
  assessment_criteria: string
  starts_on: string | null
  due_on: string | null
  simulation_hours: number
  status: string
  created_at: string
  updated_at: string
}

export function parseStringList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

export function toAssignment(row: AssignmentRow) {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    instructions: row.instructions,
    stageIndex: Number(row.stage_index),
    levelId: row.level_id,
    missionId: row.mission_id,
    learningObjectives: parseStringList(row.learning_objectives),
    assessmentCriteria: parseStringList(row.assessment_criteria),
    startsOn: row.starts_on,
    dueOn: row.due_on,
    simulationHours: Number(row.simulation_hours),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ---------------------------------------------------------------- scenarios -- */

export const SCENARIO_TEMPLATES = ['economic_downturn', 'supplier_crisis', 'funding_challenge', 'custom'] as const
export type ScenarioTemplate = (typeof SCENARIO_TEMPLATES)[number]

export const SCENARIOS_STATUSES = ['DRAFT', 'RUNNING', 'ENDED'] as const

interface ScenarioTemplateDef {
  value: ScenarioTemplate
  label: string
  description: string
  /** Starting conditions, framed as the story the lecturer is setting. */
  rates: {
    inflationRate: number | null
    interestRate: number | null
    supplierCost: number | null
    customerDemand: number | null
    competition: number | null
    operatingCost: number | null
    fundingClimate: string | null
  }
  durationHours: number
  evaluationCriteria: string[]
}

export const SCENARIO_TEMPLATE_DEFS: ScenarioTemplateDef[] = [
  {
    value: 'economic_downturn',
    label: 'Economic downturn',
    description:
      'Inflation rises, operating costs climb and customers spend less. Students must protect margin without abandoning growth.',
    rates: {
      inflationRate: 25,
      interestRate: 22,
      supplierCost: 18,
      customerDemand: -30,
      competition: 10,
      operatingCost: 20,
      fundingClimate: 'tight',
    },
    durationHours: 72,
    evaluationCriteria: [
      'Recognised the downturn early and revised forecasts',
      'Protected cash flow before pursuing growth',
      'Cut costs without damaging customer relationships',
      'Explained the trade-offs behind each decision',
    ],
  },
  {
    value: 'supplier_crisis',
    label: 'Supplier crisis',
    description:
      'A key supplier is disrupted. Procurement costs jump and inventory runs short. Students must keep the business trading.',
    rates: {
      inflationRate: 16,
      interestRate: 19,
      supplierCost: 45,
      customerDemand: -10,
      competition: 8,
      operatingCost: 5,
      fundingClimate: 'neutral',
    },
    durationHours: 48,
    evaluationCriteria: [
      'Identified alternative suppliers',
      'Prioritised which customers to serve from limited stock',
      'Negotiated rather than simply absorbing the increase',
      'Communicated the disruption honestly',
    ],
  },
  {
    value: 'funding_challenge',
    label: 'Funding challenge',
    description:
      'Investment is available, but on the investor’s terms. Students must decide what the business is worth and defend it.',
    rates: {
      inflationRate: 12,
      interestRate: 14,
      supplierCost: 5,
      customerDemand: 10,
      competition: 12,
      operatingCost: 5,
      fundingClimate: 'favourable',
    },
    durationHours: 96,
    evaluationCriteria: [
      'Presented a defensible valuation',
      'Understood the dilution being offered',
      'Matched the investor to the business stage',
      'Negotiated terms rather than accepting the first offer',
    ],
  },
  {
    value: 'custom',
    label: 'Custom scenario',
    description: 'Set every condition yourself.',
    rates: {
      inflationRate: null,
      interestRate: null,
      supplierCost: null,
      customerDemand: null,
      competition: null,
      operatingCost: null,
      fundingClimate: null,
    },
    durationHours: 48,
    evaluationCriteria: [],
  },
]

export function scenarioTemplates() {
  return SCENARIO_TEMPLATE_DEFS.map((template) => ({
    value: template.value,
    label: template.label,
    description: template.description,
    rates: template.rates,
    durationHours: template.durationHours,
    evaluationCriteria: template.evaluationCriteria,
  }))
}

export interface ScenarioRow {
  id: string
  lecturer_id: string
  class_id: string | null
  name: string
  template: string
  description: string
  inflation_rate: number | null
  interest_rate: number | null
  supplier_cost: number | null
  customer_demand: number | null
  competition: number | null
  operating_cost: number | null
  funding_climate: string | null
  duration_hours: number
  evaluation_criteria: string
  status: string
  started_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export function toScenario(row: ScenarioRow) {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    template: row.template,
    description: row.description,
    rates: {
      inflationRate: row.inflation_rate,
      interestRate: row.interest_rate,
      supplierCost: row.supplier_cost,
      customerDemand: row.customer_demand,
      competition: row.competition,
      operatingCost: row.operating_cost,
      fundingClimate: row.funding_climate,
    },
    durationHours: Number(row.duration_hours),
    evaluationCriteria: parseStringList(row.evaluation_criteria),
    status: row.status,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ----------------------------------------------------------- the vocabulary -- */

/** Everything the lecturer portal's pickers render. */
export function classroomVocabulary() {
  return {
    dimensions: ASSESSMENT_DIMENSIONS.map((dimension) => ({ ...dimension })),
    classStatuses: [...CLASS_STATUSES],
    memberStatuses: [...MEMBER_STATUSES],
    assignmentStatuses: [...ASSIGNMENT_STATUSES],
    submissionStatuses: [...SUBMISSION_STATUSES],
    scenarioTemplates: scenarioTemplates(),
    scenarioTemplateValues: [...SCENARIO_TEMPLATES],
    scenarioStatuses: [...SCENARIOS_STATUSES],
    gradeBands: [
      { min: 70, grade: 'A' },
      { min: 60, grade: 'B' },
      { min: 50, grade: 'C' },
      { min: 45, grade: 'D' },
      { min: 40, grade: 'E' },
      { min: 0, grade: 'F' },
    ],
  }
}
