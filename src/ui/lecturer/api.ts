/**
 * The shapes the lecturer portal works with.
 *
 * Every interface below mirrors the JSON `server/routes/lecturer.ts` actually
 * returns — the snake_case columns are converted to camelCase by the server's
 * `toClass` / `toStudent` / `toAssignment` / `toScenario` helpers. Nothing here
 * is aspirational: a field appears only where the server sends one.
 */

/* --------------------------------------------------------------- vocabulary -- */

export interface Dimension {
  key: string
  label: string
}

export interface ScenarioTemplate {
  value: string
  label: string
  description: string
  rates: ScenarioRates
  durationHours: number
  evaluationCriteria: string[]
}

export interface ScenarioRates {
  inflationRate: number | null
  interestRate: number | null
  supplierCost: number | null
  customerDemand: number | null
  competition: number | null
  operatingCost: number | null
  fundingClimate: string | null
}

/** GET /lecturer/meta — the classroom vocabulary. */
export interface Meta {
  dimensions: Dimension[]
  classStatuses: string[]
  memberStatuses: string[]
  assignmentStatuses: string[]
  submissionStatuses: string[]
  scenarioTemplates: ScenarioTemplate[]
  scenarioTemplateValues: string[]
  scenarioStatuses: string[]
  gradeBands: { min: number; grade: string }[]
}

/* ----------------------------------------------------------------- overview -- */

/** GET /lecturer/overview */
export interface Overview {
  classes: { total: number; active: number; archived: number }
  students: { total: number; active: number; pending: number; needingAttention: number }
  assignments: { total: number; open: number; submissions: number; completed: number }
  averagePerformance: number | null
  classProgression: { classId: string; name: string; students: number; averageLevel: number; averageXp: number }[]
  needingAttention: (StudentSummary & { reasons: string[] })[]
  recentActivity: { id: string; action: string; detail: string; at: string; actor: string | null }[]
  upcomingDeadlines: {
    id: string
    title: string
    className: string
    dueOn: string | null
    students: number
    submitted: number
  }[]
}

/* ------------------------------------------------------------------ classes -- */

/** The lecturer's own class, as returned by `toClass`. */
export interface ClassSummary {
  id: string
  name: string
  description: string
  term: string
  inviteCode: string
  status: string
  startsOn: string | null
  endsOn: string | null
  simulationPaused: boolean
  createdAt: string
  updatedAt: string
}

export interface ClassRow extends ClassSummary {
  students: number
  pending: number
  assignments: number
}

export interface ClassesPayload {
  classes: ClassRow[]
  total: number
}

/* ----------------------------------------------------------------- students -- */

export interface AssessmentSummary {
  overall: number | null
  count: number
  grade: string
}

/** A student, as returned by `toStudent`. */
export interface StudentSummary {
  id: string
  fullName: string
  email: string
  createdAt: string
  lastSeenAt: string | null
  businessName: string | null
  sector: string | null
  stageIndex: number | null
  levelIndex: number | null
  xp: number
  cash: number
  reputation: number
  completedLevels: number
  memberStatus: string
  classId: string
  className: string
  hasBusiness: boolean
  /** Present on the students list and the performance payload. */
  assessment?: AssessmentSummary | null
}

export interface StudentsPayload {
  students: StudentSummary[]
  total: number
}

/** GET /lecturer/players — player accounts that can be added to a class. */
export interface PlayerOption {
  id: string
  fullName: string
  email: string
  businessName: string | null
  sector: string | null
  levelIndex: number | null
}

export interface PlayersPayload {
  players: PlayerOption[]
  total: number
}

/** GET /lecturer/classes/:id */
export interface ClassDetailPayload {
  class: ClassSummary
  students: StudentSummary[]
  assignments: (AssignmentSummary & { assigned: number; submitted: number })[]
}

/** GET /lecturer/students/:id — a student's company, faithful to the server. */
export interface StudentDetailPayload {
  student: StudentSummary
  business: {
    businessName: string
    sector: string
    idea: string
    description: string
    problem: string
    product: string
    ambition: string | null
    updatedAt: string
  } | null
  assignments: {
    id: string
    title: string
    className: string
    dueOn: string | null
    status: string
    submissionStatus: string
    submittedAt: string | null
  }[]
  assessments: {
    id: string
    assignmentId: string | null
    scores: Record<string, number>
    overall: number | null
    grade: string
    feedback: string
    updatedAt: string
  }[]
  activity: { id: string; action: string; detail: string; at: string }[]
}

/* -------------------------------------------------------------- assignments -- */

/** An assignment, as returned by `toAssignment`. */
export interface AssignmentSummary {
  id: string
  classId: string
  title: string
  instructions: string
  stageIndex: number
  levelId: string | null
  missionId: string | null
  learningObjectives: string[]
  assessmentCriteria: string[]
  startsOn: string | null
  dueOn: string | null
  simulationHours: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface AssignmentRow extends AssignmentSummary {
  className: string
  assigned: number
  submitted: number
  graded: number
}

export interface AssignmentsPayload {
  assignments: AssignmentRow[]
  total: number
}

export interface AssignmentDetailPayload {
  assignment: AssignmentSummary
  className: string
  progress: {
    studentId: string
    fullName: string
    email: string
    status: string
    submittedAt: string | null
    score: number | null
    grade: string | null
    feedback: string | null
  }[]
}

/** The body the assignment create/update endpoints validate. */
export interface AssignmentInput {
  classId: string
  title: string
  instructions: string
  stageIndex: number
  levelId: string | null
  missionId: string | null
  learningObjectives: string[]
  assessmentCriteria: string[]
  startsOn: string | null
  dueOn: string | null
  simulationHours: number
  assignTo: string[]
}

/* ---------------------------------------------------------------- scenarios -- */

/** A scenario, as returned by `toScenario`. */
export interface ScenarioSummary {
  id: string
  classId: string | null
  name: string
  template: string
  description: string
  rates: ScenarioRates
  durationHours: number
  evaluationCriteria: string[]
  status: string
  startedAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScenarioRow extends ScenarioSummary {
  className: string | null
}

export interface ScenariosPayload {
  scenarios: ScenarioRow[]
  templates: ScenarioTemplate[]
  total: number
  running: number
}

export interface ScenarioInput {
  classId: string | null
  name: string
  template: string
  description: string
  rates: ScenarioRates
  durationHours: number
  evaluationCriteria: string[]
}

/* ------------------------------------------------------------ live classroom -- */

export interface LiveEvent {
  id: string
  name: string
  kind: string
  scope: string
  impact: number
  status: string
  startsAt: string | null
  endsAt: string | null
}

export interface LiveParticipant extends StudentSummary {
  active: boolean
  tasksAssigned: number
  tasksSubmitted: number
  overdue: number
}

export interface LivePayload {
  class: ClassSummary | null
  participants: LiveParticipant[]
  summary: {
    students: number
    online: number
    withBusiness: number
    averageLevel: number
    averageXp: number
    submitted: number
    assigned: number
  } | null
  events: LiveEvent[]
  scenarios: ScenarioSummary[]
}

/** POST /lecturer/live/:classId/events */
export interface EconomicEventInput {
  kind: string
  name: string
  description: string
  impact: number
  durationHours: number
}

/* --------------------------------------------------------------- assessment -- */

/** GET /lecturer/performance */
export interface PerformancePayload {
  students: StudentSummary[]
  dimensions: { key: string; label: string; average: number | null; marked: number }[]
  graded: number
  total: number
  classId: string | null
  classes: ClassSummary[]
}

/** PUT /lecturer/assessments */
export interface AssessmentInput {
  assignmentId: string | null
  studentId: string
  scores: Record<string, number>
  feedback: string
}

/* ----------------------------------------------------------------- reports -- */

export interface ReportRow {
  id: string
  fullName: string
  email: string
  businessName: string | null
  sector: string | null
  levelIndex: number | null
  stageIndex: number | null
  xp: number
  cash: number
  reputation: number
  completedLevels: number
  assessment: AssessmentSummary | null
  strengths: { key: string; label: string; score: number }[]
  weaknesses: { key: string; label: string; score: number }[]
  feedback: string
}

export interface ReportsPayload {
  reports: ReportRow[]
  scope: { classId: string | null; studentId: string | null }
  summary: { students: number; graded: number; classAverage: number | null; withBusiness: number }
  classes: ClassSummary[]
  generatedAt: string
}

/* ----------------------------------------------------------- notifications -- */

export interface NotificationRow {
  id: string
  title: string
  body: string
  kind: string
  read: boolean
  createdAt: string
}

export interface NotificationsPayload {
  notifications: NotificationRow[]
  unread: number
}

/* ---------------------------------------------------------------- settings -- */

export interface SettingsPayload {
  profile: {
    id: string
    fullName: string
    email: string
    role: string
    createdAt: string
  }
  teaching: {
    classes: number
    students: number
    assignments: number
    scenarios: number
  }
}

/* ------------------------------------------------------------------ helpers -- */

/** A plain calendar date, for deadlines — "12 Mar 2026". */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** A date-and-time, for "starts on" / "ran until" lines. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  return new Date(then).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Converts an `<input type="datetime-local">` value to the ISO string the API stores. */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

/** The reverse: an ISO string to the value `<input type="datetime-local">` expects. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const date = new Date(then)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The badge tone that matches a lifecycle status. */
export function statusTone(status: string): '' | 'good' | 'warn' | 'bad' {
  switch (status) {
    case 'ACTIVE':
    case 'OPEN':
    case 'RUNNING':
    case 'SUBMITTED':
    case 'GRADED':
      return 'good'
    case 'PENDING':
    case 'DRAFT':
    case 'IN_PROGRESS':
    case 'ARCHIVED':
    case 'ENDED':
      return 'warn'
    case 'REMOVED':
    case 'CLOSED':
      return 'bad'
    default:
      return ''
  }
}

/** A friendly, capitalised label for a server status value. */
export function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** The economic events a lecturer may introduce. Mirrors the server's enum. */
export const EVENT_KINDS: { value: string; label: string }[] = [
  { value: 'fuel_price', label: 'Fuel price change' },
  { value: 'supplier_disruption', label: 'Supplier disruption' },
  { value: 'inflation_spike', label: 'Inflation spike' },
  { value: 'interest_rate', label: 'Interest rate change' },
  { value: 'demand_decline', label: 'Demand decline' },
  { value: 'regulatory_change', label: 'Regulatory change' },
  { value: 'currency_fluctuation', label: 'Currency fluctuation' },
  { value: 'festive_demand', label: 'Festive demand' },
]

/** The funding climates the scenario schema accepts. */
export const FUNDING_CLIMATES = ['tight', 'neutral', 'favourable'] as const

/** Copies text to the clipboard, falling back to a temporary field. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  } catch {
    return false
  }
}
