import { Router } from 'express'
import { z } from 'zod'
import {
  ASSESSMENT_DIMENSIONS,
  ASSIGNMENT_STATUSES,
  CLASS_STATUSES,
  SCENARIO_TEMPLATES,
  SUBMISSION_STATUSES,
  averageScore,
  classroomVocabulary,
  generateInviteCode,
  gradeFor,
  parseScores,
  parseStringList,
  scenarioTemplates,
  toAssignment,
  toClass,
  toScenario,
  type AssignmentRow,
  type ClassRow,
  type ScenarioRow,
} from '../classroom'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { newId } from '../security'
import { audit } from '../users'

/**
 * The lecturer portal's API.
 *
 * Every route here is scoped to the signed-in lecturer: a class, an assignment
 * or an assessment that belongs to someone else simply does not exist as far as
 * this router is concerned. That check is `ownedClass` / `ownedAssignment`
 * below, and it is applied before any read or write.
 *
 * A lecturer never touches the simulation engine directly. Where the portal
 * offers control — pausing a class, introducing an event, running a scenario —
 * it writes a bounded record that the simulation reads, rather than altering
 * platform-wide configuration.
 */

const router = Router()

/* ------------------------------------------------------------------ helpers -- */

function ownedClass(classId: string, lecturerId: string): ClassRow | undefined {
  return one<ClassRow>('SELECT * FROM classes WHERE id = ? AND lecturer_id = ?', classId, lecturerId)
}

function ownedAssignment(id: string, lecturerId: string): AssignmentRow | undefined {
  return one<AssignmentRow>('SELECT * FROM assignments WHERE id = ? AND lecturer_id = ?', id, lecturerId)
}

function ownedScenario(id: string, lecturerId: string): ScenarioRow | undefined {
  return one<ScenarioRow>('SELECT * FROM scenarios WHERE id = ? AND lecturer_id = ?', id, lecturerId)
}

/** The ids of every class this lecturer runs. */
function lecturerClassIds(lecturerId: string): string[] {
  return many<{ id: string }>('SELECT id FROM classes WHERE lecturer_id = ?', lecturerId).map((r) => r.id)
}

interface StudentRow {
  id: string
  email: string
  full_name: string
  created_at: string
  last_seen_at: string | null
  business_name: string | null
  sector: string | null
  stage_index: number | null
  level_index: number | null
  xp: number | null
  cash: number | null
  reputation: number | null
  completed_levels: string | null
  member_status: string
  class_id: string
  class_name: string
}

const STUDENT_SELECT = `
  SELECT u.id, u.email, u.full_name, u.created_at, u.last_seen_at,
         b.business_name, b.sector,
         p.stage_index, p.level_index, p.xp, p.cash, p.reputation, p.completed_levels,
         m.status AS member_status, m.class_id, c.name AS class_name
  FROM class_members m
  JOIN users u ON u.id = m.student_id
  JOIN classes c ON c.id = m.class_id
  LEFT JOIN business_profiles b ON b.user_id = u.id
  LEFT JOIN player_progress  p ON p.user_id = u.id
`

function toStudent(row: StudentRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    businessName: row.business_name,
    sector: row.sector,
    stageIndex: row.stage_index,
    levelIndex: row.level_index,
    xp: row.xp ?? 0,
    cash: row.cash ?? 0,
    reputation: row.reputation ?? 0,
    completedLevels: parseStringList(row.completed_levels).length,
    memberStatus: row.member_status,
    classId: row.class_id,
    className: row.class_name,
    hasBusiness: row.business_name !== null,
  }
}

const DAY_MS = 86_400_000

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function isRecent(iso: string | null, days: number): boolean {
  if (!iso) return false
  const then = Date.parse(iso)
  return Number.isFinite(then) && Date.now() - then <= days * DAY_MS
}

/** Mean assessment score per student, across the lecturer's assignments. */
function assessmentAverages(lecturerId: string): Map<string, { overall: number | null; count: number; grade: string }> {
  const rows = many<{ student_id: string; scores: string; overall: number | null; grade: string }>(
    'SELECT student_id, scores, overall, grade FROM assessments WHERE lecturer_id = ?',
    lecturerId,
  )
  const totals = new Map<string, { sum: number; count: number; grades: string[] }>()
  for (const row of rows) {
    const value = row.overall ?? averageScore(parseScores(row.scores))
    if (value === null) continue
    const entry = totals.get(row.student_id) ?? { sum: 0, count: 0, grades: [] }
    entry.sum += value
    entry.count += 1
    if (row.grade) entry.grades.push(row.grade)
    totals.set(row.student_id, entry)
  }

  const out = new Map<string, { overall: number | null; count: number; grade: string }>()
  for (const [studentId, entry] of totals) {
    const overall = entry.sum / entry.count
    out.set(studentId, { overall, count: entry.count, grade: gradeFor(overall) })
  }
  return out
}

/** Mean of each assessment dimension across a set of students. */
function dimensionAverages(studentIds: string[], lecturerId: string) {
  if (studentIds.length === 0) {
    return ASSESSMENT_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, average: null as number | null, marked: 0 }))
  }
  const placeholders = studentIds.map(() => '?').join(',')
  const rows = many<{ scores: string }>(
    `SELECT scores FROM assessments WHERE lecturer_id = ? AND student_id IN (${placeholders})`,
    lecturerId,
    ...studentIds,
  )

  return ASSESSMENT_DIMENSIONS.map((dimension) => {
    let sum = 0
    let marked = 0
    for (const row of rows) {
      const scores = parseScores(row.scores)
      const value = scores[dimension.key]
      if (typeof value === 'number') {
        sum += value
        marked += 1
      }
    }
    return {
      key: dimension.key,
      label: dimension.label,
      average: marked === 0 ? null : sum / marked,
      marked,
    }
  })
}

/* --------------------------------------------------------------- vocabulary -- */

router.get(
  '/meta',
  wrap(async (_req, res) => {
    res.json(classroomVocabulary())
  }),
)

/* ----------------------------------------------------------------- overview -- */

router.get(
  '/overview',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)

    const classes = many<ClassRow>(
      'SELECT * FROM classes WHERE lecturer_id = ? ORDER BY created_at DESC',
      lecturerId,
    )
    const activeClasses = classes.filter((c) => c.status === 'ACTIVE')

    const members = classIds.length
      ? many<StudentRow>(
          `${STUDENT_SELECT} WHERE m.class_id IN (${classIds.map(() => '?').join(',')}) AND m.status != 'REMOVED'`,
          ...classIds,
        )
      : []
    const activeMembers = members.filter((m) => m.member_status === 'ACTIVE')
    const pendingMembers = members.filter((m) => m.member_status === 'PENDING')

    const assignments = many<AssignmentRow>(
      'SELECT * FROM assignments WHERE lecturer_id = ? ORDER BY created_at DESC',
      lecturerId,
    )
    const openAssignments = assignments.filter((a) => a.status === 'OPEN')

    const assignmentIds = assignments.map((a) => a.id)
    const submissions = assignmentIds.length
      ? many<{ assignment_id: string; student_id: string; status: string; submitted_at: string | null }>(
          `SELECT assignment_id, student_id, status, submitted_at FROM assignment_students
           WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})`,
          ...assignmentIds,
        )
      : []

    const completedSubmissions = submissions.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'GRADED',
    ).length

    const averages = assessmentAverages(lecturerId)
    const gradedValues = Array.from(averages.values()).map((entry) => entry.overall)
    const averagePerformance =
      gradedValues.length === 0
        ? null
        : (gradedValues as number[]).reduce((sum, v) => sum + v, 0) / gradedValues.length

    // Students who need attention: inactive for a week, or holding an overdue
    // assignment, or scoring below the pass mark.
    const overdueStudentIds = new Set<string>()
    const now = Date.now()
    for (const submission of submissions) {
      if (submission.status === 'SUBMITTED' || submission.status === 'GRADED') continue
      const assignment = assignments.find((a) => a.id === submission.assignment_id)
      if (!assignment?.due_on) continue
      const due = Date.parse(assignment.due_on)
      if (Number.isFinite(due) && due < now) overdueStudentIds.add(submission.student_id)
    }

    const needingAttention = activeMembers
      .filter((member) => {
        const average = averages.get(member.id)
        return (
          !isRecent(member.last_seen_at, 7) ||
          overdueStudentIds.has(member.id) ||
          (average?.overall !== null && average?.overall !== undefined && average.overall < 50)
        )
      })
      .map((member) => {
        const average = averages.get(member.id)
        const reasons: string[] = []
        if (!isRecent(member.last_seen_at, 7)) reasons.push('Not active this week')
        if (overdueStudentIds.has(member.id)) reasons.push('Overdue assignment')
        if (average?.overall !== null && average?.overall !== undefined && average.overall < 50) {
          reasons.push(`Averaging ${Math.round(average.overall)}%`)
        }
        return { ...toStudent(member), reasons }
      })

    const classProgression = classes.map((row) => {
      const classMembers = activeMembers.filter((m) => m.class_id === row.id)
      const levels = classMembers.map((m) => m.level_index ?? 0).filter((n) => n > 0)
      return {
        classId: row.id,
        name: row.name,
        students: classMembers.length,
        averageLevel: levels.length === 0 ? 0 : levels.reduce((s, n) => s + n, 0) / levels.length,
        averageXp:
          classMembers.length === 0
            ? 0
            : classMembers.reduce((s, m) => s + (m.xp ?? 0), 0) / classMembers.length,
      }
    })

    const studentIds = activeMembers.map((m) => m.id)
    const activity = studentIds.length
      ? many<{ id: string; action: string; detail: string; at: string; full_name: string | null }>(
          `SELECT a.id, a.action, a.detail, a.at, u.full_name
           FROM audit_logs a JOIN users u ON u.id = a.user_id
           WHERE a.user_id IN (${studentIds.map(() => '?').join(',')})
           ORDER BY a.at DESC LIMIT 20`,
          ...studentIds,
        ).map((row) => ({ id: row.id, action: row.action, detail: row.detail, at: row.at, actor: row.full_name }))
      : []

    const upcomingDeadlines = openAssignments
      .filter((a) => a.due_on && Date.parse(a.due_on) > now)
      .sort((a, b) => Date.parse(a.due_on!) - Date.parse(b.due_on!))
      .slice(0, 8)
      .map((assignment) => {
        const className = classes.find((c) => c.id === assignment.class_id)?.name ?? 'Class'
        const set = submissions.filter((s) => s.assignment_id === assignment.id)
        return {
          id: assignment.id,
          title: assignment.title,
          className,
          dueOn: assignment.due_on,
          students: set.length,
          submitted: set.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
        }
      })

    res.json({
      classes: {
        total: classes.length,
        active: activeClasses.length,
        archived: classes.length - activeClasses.length,
      },
      students: {
        total: activeMembers.length,
        active: activeMembers.filter((m) => isRecent(m.last_seen_at, 7)).length,
        pending: pendingMembers.length,
        needingAttention: needingAttention.length,
      },
      assignments: {
        total: assignments.length,
        open: openAssignments.length,
        submissions: submissions.length,
        completed: completedSubmissions,
      },
      averagePerformance,
      classProgression,
      needingAttention: needingAttention.slice(0, 8),
      recentActivity: activity,
      upcomingDeadlines,
    })
  }),
)

/* ------------------------------------------------------------------ classes -- */

router.get(
  '/classes',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classes = many<ClassRow>(
      'SELECT * FROM classes WHERE lecturer_id = ? ORDER BY status ASC, created_at DESC',
      lecturerId,
    )

    const rows = classes.map((row) => {
      const students = one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND status = 'ACTIVE'",
        row.id,
      )
      const pending = one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND status = 'PENDING'",
        row.id,
      )
      const assignments = one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM assignments WHERE class_id = ?',
        row.id,
      )
      return {
        ...toClass(row),
        students: Number(students?.n ?? 0),
        pending: Number(pending?.n ?? 0),
        assignments: Number(assignments?.n ?? 0),
      }
    })

    res.json({ classes: rows, total: rows.length })
  }),
)

const classSchema = z.object({
  name: z.string().trim().min(2, 'Give the class a name.').max(80),
  description: z.string().trim().max(500).default(''),
  term: z.string().trim().max(60).default(''),
  startsOn: z.string().trim().max(40).nullish(),
  endsOn: z.string().trim().max(40).nullish(),
})

router.post(
  '/classes',
  wrap(async (req, res) => {
    const parsed = classSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the class details.' })
      return
    }
    const data = parsed.data
    const id = newId()
    const now = new Date().toISOString()

    run(
      `INSERT INTO classes (id, lecturer_id, name, description, term, invite_code, status, starts_on, ends_on, simulation_paused, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 0, ?, ?)`,
      id,
      req.user!.id,
      data.name,
      data.description,
      data.term,
      generateInviteCode(),
      data.startsOn ?? null,
      data.endsOn ?? null,
      now,
      now,
    )

    audit(req.user!.id, 'lecturer.class.create', `Created the class "${data.name}"`)
    const row = one<ClassRow>('SELECT * FROM classes WHERE id = ?', id)
    res.status(201).json({ class: row ? toClass(row) : null })
  }),
)

router.get(
  '/classes/:id',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const members = many<StudentRow>(`${STUDENT_SELECT} WHERE m.class_id = ?`, row.id)
      .map(toStudent)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))

    const assignments = many<AssignmentRow>(
      'SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC',
      row.id,
    )
    const assignmentIds = assignments.map((a) => a.id)
    const setRows = assignmentIds.length
      ? many<{ assignment_id: string; status: string }>(
          `SELECT assignment_id, status FROM assignment_students WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})`,
          ...assignmentIds,
        )
      : []

    res.json({
      class: toClass(row),
      students: members,
      assignments: assignments.map((assignment) => {
        const set = setRows.filter((s) => s.assignment_id === assignment.id)
        return {
          ...toAssignment(assignment),
          assigned: set.length,
          submitted: set.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
        }
      }),
    })
  }),
)

router.put(
  '/classes/:id',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }
    const parsed = classSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the class details.' })
      return
    }
    const data = parsed.data

    run(
      `UPDATE classes SET name = ?, description = ?, term = ?, starts_on = ?, ends_on = ?, updated_at = ? WHERE id = ?`,
      data.name,
      data.description,
      data.term,
      data.startsOn ?? null,
      data.endsOn ?? null,
      new Date().toISOString(),
      row.id,
    )

    audit(req.user!.id, 'lecturer.class.update', `Updated the class "${data.name}"`)
    const updated = one<ClassRow>('SELECT * FROM classes WHERE id = ?', row.id)
    res.json({ class: updated ? toClass(updated) : null })
  }),
)

const classActionSchema = z.object({ action: z.enum(['archive', 'reopen', 'pause', 'resume']) })

router.post(
  '/classes/:id/status',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }
    const parsed = classActionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown action.' })
      return
    }

    const now = new Date().toISOString()
    const { action } = parsed.data

    if (action === 'archive' || action === 'reopen') {
      const next = action === 'archive' ? 'ARCHIVED' : 'ACTIVE'
      if (row.status === next) {
        res.status(400).json({ error: `That class is already ${next.toLowerCase()}.` })
        return
      }
      run('UPDATE classes SET status = ?, updated_at = ? WHERE id = ?', next, now, row.id)
      audit(req.user!.id, `lecturer.class.${action}`, `${action === 'archive' ? 'Archived' : 'Reopened'} "${row.name}"`)
    } else {
      const paused = action === 'pause' ? 1 : 0
      if (row.simulation_paused === paused) {
        res.status(400).json({ error: `That class's simulation is already ${paused ? 'paused' : 'running'}.` })
        return
      }
      run('UPDATE classes SET simulation_paused = ?, updated_at = ? WHERE id = ?', paused, now, row.id)
      audit(
        req.user!.id,
        `lecturer.class.${action}`,
        `${paused ? 'Paused' : 'Resumed'} the simulation for "${row.name}"`,
      )
    }

    const updated = one<ClassRow>('SELECT * FROM classes WHERE id = ?', row.id)
    res.json({ class: updated ? toClass(updated) : null })
  }),
)

router.post(
  '/classes/:id/invite-code',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }
    const code = generateInviteCode()
    run('UPDATE classes SET invite_code = ?, updated_at = ? WHERE id = ?', code, new Date().toISOString(), row.id)
    audit(req.user!.id, 'lecturer.class.invite', `Rotated the invitation code for "${row.name}"`)
    res.json({ inviteCode: code })
  }),
)

router.delete(
  '/classes/:id',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }
    run('DELETE FROM classes WHERE id = ?', row.id)
    audit(req.user!.id, 'lecturer.class.delete', `Deleted the class "${row.name}"`)
    res.json({ ok: true })
  }),
)

/* ----------------------------------------------------------------- students -- */

/** Player accounts a lecturer can add to a class. */
router.get(
  '/players',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const classId = typeof req.query.classId === 'string' ? req.query.classId : ''

    const where: string[] = ["u.role = 'PLAYER' AND u.status = 'ACTIVE'", 'u.email_verified = 1']
    const params: (string | number)[] = []
    if (q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR b.business_name LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    if (classId) {
      where.push('u.id NOT IN (SELECT student_id FROM class_members WHERE class_id = ?)')
      params.push(classId)
    }

    const rows = many<{
      id: string
      full_name: string
      email: string
      business_name: string | null
      sector: string | null
      level_index: number | null
    }>(
      `SELECT u.id, u.full_name, u.email, b.business_name, b.sector, p.level_index
       FROM users u
       LEFT JOIN business_profiles b ON b.user_id = u.id
       LEFT JOIN player_progress p ON p.user_id = u.id
       WHERE ${where.join(' AND ')} ORDER BY u.full_name ASC LIMIT 50`,
      ...params,
    )

    res.json({
      players: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        businessName: row.business_name,
        sector: row.sector,
        levelIndex: row.level_index,
      })),
      total: rows.length,
    })
  }),
)

router.get(
  '/students',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)
    const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
    const status = typeof req.query.status === 'string' ? req.query.status : 'ACTIVE'
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

    if (classIds.length === 0) {
      res.json({ students: [], total: 0 })
      return
    }

    const where: string[] = [`m.class_id IN (${classIds.map(() => '?').join(',')})`]
    const params: (string | number)[] = [...classIds]

    if (classId && classIds.includes(classId)) {
      where.push('m.class_id = ?')
      params.push(classId)
    }
    if (status !== 'ALL') {
      where.push('m.status = ?')
      params.push(status)
    }
    if (q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR b.business_name LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    const rows = many<StudentRow>(
      `${STUDENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY u.full_name ASC LIMIT 500`,
      ...params,
    )
    const averages = assessmentAverages(lecturerId)

    res.json({
      students: rows.map((row) => {
        const average = averages.get(row.id)
        return { ...toStudent(row), assessment: average ?? null }
      }),
      total: rows.length,
    })
  }),
)

router.get(
  '/students/:id',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const studentId = String(req.params.id)
    const classIds = lecturerClassIds(lecturerId)

    if (classIds.length === 0) {
      res.status(404).json({ error: 'That student is not in your classes.' })
      return
    }

    const membership = one<{ class_id: string; status: string }>(
      `SELECT class_id, status FROM class_members
       WHERE student_id = ? AND class_id IN (${classIds.map(() => '?').join(',')}) LIMIT 1`,
      studentId,
      ...classIds,
    )
    if (!membership) {
      res.status(404).json({ error: 'That student is not in your classes.' })
      return
    }

    const row = one<StudentRow>(`${STUDENT_SELECT} WHERE u.id = ? AND m.class_id = ?`, studentId, membership.class_id)
    if (!row) {
      res.status(404).json({ error: 'That student is not in your classes.' })
      return
    }

    const profile = one<{
      business_name: string
      sector: string
      idea: string
      description: string
      problem: string
      product: string
      ambition: string | null
      updated_at: string
    }>('SELECT * FROM business_profiles WHERE user_id = ?', studentId)

    const assignments = many<{
      id: string
      title: string
      due_on: string | null
      status: string
      submission_status: string | null
      submitted_at: string | null
      class_name: string
    }>(
      `SELECT a.id, a.title, a.due_on, a.status, s.status AS submission_status, s.submitted_at, c.name AS class_name
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN assignment_students s ON s.assignment_id = a.id AND s.student_id = ?
       WHERE a.lecturer_id = ? AND a.class_id = ? ORDER BY a.created_at DESC`,
      studentId,
      lecturerId,
      membership.class_id,
    )

    const assessments = many<{ id: string; assignment_id: string | null; scores: string; overall: number | null; grade: string; feedback: string; updated_at: string }>(
      'SELECT id, assignment_id, scores, overall, grade, feedback, updated_at FROM assessments WHERE lecturer_id = ? AND student_id = ?',
      lecturerId,
      studentId,
    ).map((row2) => ({
      id: row2.id,
      assignmentId: row2.assignment_id,
      scores: parseScores(row2.scores),
      overall: row2.overall ?? averageScore(parseScores(row2.scores)),
      grade: row2.grade || (row2.overall !== null ? gradeFor(row2.overall) : ''),
      feedback: row2.feedback,
      updatedAt: row2.updated_at,
    }))

    const activity = many<{ id: string; action: string; detail: string; at: string }>(
      'SELECT id, action, detail, at FROM audit_logs WHERE user_id = ? ORDER BY at DESC LIMIT 25',
      studentId,
    )

    res.json({
      student: toStudent(row),
      business: profile
        ? {
            businessName: profile.business_name,
            sector: profile.sector,
            idea: profile.idea,
            description: profile.description,
            problem: profile.problem,
            product: profile.product,
            ambition: profile.ambition,
            updatedAt: profile.updated_at,
          }
        : null,
      assignments: assignments.map((row2) => ({
        id: row2.id,
        title: row2.title,
        className: row2.class_name,
        dueOn: row2.due_on,
        status: row2.status,
        submissionStatus: row2.submission_status ?? 'NOT_SET',
        submittedAt: row2.submitted_at,
      })),
      assessments,
      activity,
    })
  }),
)

const addStudentSchema = z.object({ studentId: z.string().trim().min(1, 'Choose a student.') })

router.post(
  '/classes/:id/students',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }
    const parsed = addStudentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Choose a student.' })
      return
    }

    const student = one<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM users WHERE id = ? AND role = 'PLAYER'",
      parsed.data.studentId,
    )
    if (!student) {
      res.status(404).json({ error: 'That player does not exist.' })
      return
    }

    const existing = one<{ id: string; status: string }>(
      'SELECT id, status FROM class_members WHERE class_id = ? AND student_id = ?',
      row.id,
      student.id,
    )

    const now = new Date().toISOString()
    if (existing) {
      if (existing.status === 'ACTIVE') {
        res.status(400).json({ error: 'That student is already in this class.' })
        return
      }
      run("UPDATE class_members SET status = 'ACTIVE', joined_at = ? WHERE id = ?", now, existing.id)
    } else {
      run(
        "INSERT INTO class_members (id, class_id, student_id, status, joined_at) VALUES (?, ?, ?, 'ACTIVE', ?)",
        newId(),
        row.id,
        student.id,
        now,
      )
    }

    audit(req.user!.id, 'lecturer.class.student.add', `Added ${student.full_name} to "${row.name}"`)
    res.status(201).json({ ok: true })
  }),
)

router.post(
  '/classes/:id/students/:studentId/approve',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const member = one<{ id: string; status: string }>(
      'SELECT id, status FROM class_members WHERE class_id = ? AND student_id = ?',
      row.id,
      String(req.params.studentId),
    )
    if (!member) {
      res.status(404).json({ error: 'That student has not asked to join this class.' })
      return
    }
    if (member.status === 'ACTIVE') {
      res.status(400).json({ error: 'That student is already approved.' })
      return
    }

    run("UPDATE class_members SET status = 'ACTIVE', joined_at = ? WHERE id = ?", new Date().toISOString(), member.id)
    audit(req.user!.id, 'lecturer.class.student.approve', `Approved a student in "${row.name}"`)
    res.json({ ok: true })
  }),
)

router.delete(
  '/classes/:id/students/:studentId',
  wrap(async (req, res) => {
    const row = ownedClass(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const member = one<{ id: string; status: string }>(
      'SELECT id, status FROM class_members WHERE class_id = ? AND student_id = ?',
      row.id,
      String(req.params.studentId),
    )
    if (!member) {
      res.status(404).json({ error: 'That student is not in this class.' })
      return
    }

    run("UPDATE class_members SET status = 'REMOVED' WHERE id = ?", member.id)
    audit(req.user!.id, 'lecturer.class.student.remove', `Removed a student from "${row.name}"`)
    res.json({ ok: true })
  }),
)

/* -------------------------------------------------------------- assignments -- */

router.get(
  '/assignments',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL'

    const where: string[] = ['lecturer_id = ?']
    const params: (string | number)[] = [lecturerId]
    if (classId) {
      where.push('class_id = ?')
      params.push(classId)
    }
    if (ASSIGNMENT_STATUSES.includes(status as (typeof ASSIGNMENT_STATUSES)[number])) {
      where.push('status = ?')
      params.push(status)
    }

    const rows = many<AssignmentRow>(
      `SELECT * FROM assignments WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
      ...params,
    )
    const ids = rows.map((row) => row.id)
    const setRows = ids.length
      ? many<{ assignment_id: string; status: string }>(
          `SELECT assignment_id, status FROM assignment_students WHERE assignment_id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
      : []

    const classes = many<ClassRow>('SELECT * FROM classes WHERE lecturer_id = ?', lecturerId)
    const className = new Map(classes.map((c) => [c.id, c.name]))

    res.json({
      assignments: rows.map((row) => {
        const set = setRows.filter((s) => s.assignment_id === row.id)
        return {
          ...toAssignment(row),
          className: className.get(row.class_id) ?? 'Class',
          assigned: set.length,
          submitted: set.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
          graded: set.filter((s) => s.status === 'GRADED').length,
        }
      }),
      total: rows.length,
    })
  }),
)

const assignmentSchema = z.object({
  classId: z.string().trim().min(1, 'Choose a class.'),
  title: z.string().trim().min(2, 'Give the assignment a title.').max(90),
  instructions: z.string().trim().max(1500).default(''),
  stageIndex: z.number().int().min(1).max(5),
  levelId: z.string().trim().max(8).nullish(),
  missionId: z.string().trim().max(60).nullish(),
  learningObjectives: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  assessmentCriteria: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  startsOn: z.string().trim().max(40).nullish(),
  dueOn: z.string().trim().max(40).nullish(),
  simulationHours: z.number().int().min(0).max(500).default(0),
  assignTo: z.array(z.string().trim().min(1)).max(300).default([]),
})

/** Sets an assignment for the class, or for the named students only. */
function setAssignmentStudents(assignmentId: string, classId: string, studentIds: string[]) {
  run('DELETE FROM assignment_students WHERE assignment_id = ?', assignmentId)
  const targets =
    studentIds.length > 0
      ? studentIds
      : many<{ student_id: string }>(
          "SELECT student_id FROM class_members WHERE class_id = ? AND status = 'ACTIVE'",
          classId,
        ).map((row) => row.student_id)

  for (const studentId of targets) {
    run(
      "INSERT OR IGNORE INTO assignment_students (id, assignment_id, student_id, status) VALUES (?, ?, ?, 'PENDING')",
      newId(),
      assignmentId,
      studentId,
    )
  }
}

router.post(
  '/assignments',
  wrap(async (req, res) => {
    const parsed = assignmentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the assignment details.' })
      return
    }
    const data = parsed.data
    if (!ownedClass(data.classId, req.user!.id)) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const id = newId()
    const now = new Date().toISOString()
    run(
      `INSERT INTO assignments
         (id, class_id, lecturer_id, title, instructions, stage_index, level_id, mission_id,
          learning_objectives, assessment_criteria, starts_on, due_on, simulation_hours, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      id,
      data.classId,
      req.user!.id,
      data.title,
      data.instructions,
      data.stageIndex,
      data.levelId ?? null,
      data.missionId ?? null,
      JSON.stringify(data.learningObjectives),
      JSON.stringify(data.assessmentCriteria),
      data.startsOn ?? null,
      data.dueOn ?? null,
      data.simulationHours,
      now,
      now,
    )
    setAssignmentStudents(id, data.classId, data.assignTo)

    audit(req.user!.id, 'lecturer.assignment.create', `Set "${data.title}"`)
    const row = one<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', id)
    res.status(201).json({ assignment: row ? toAssignment(row) : null })
  }),
)

router.put(
  '/assignments/:id',
  wrap(async (req, res) => {
    const row = ownedAssignment(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That assignment does not exist.' })
      return
    }
    const parsed = assignmentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the assignment details.' })
      return
    }
    const data = parsed.data
    if (!ownedClass(data.classId, req.user!.id)) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    run(
      `UPDATE assignments SET class_id = ?, title = ?, instructions = ?, stage_index = ?, level_id = ?, mission_id = ?,
         learning_objectives = ?, assessment_criteria = ?, starts_on = ?, due_on = ?, simulation_hours = ?, updated_at = ?
       WHERE id = ?`,
      data.classId,
      data.title,
      data.instructions,
      data.stageIndex,
      data.levelId ?? null,
      data.missionId ?? null,
      JSON.stringify(data.learningObjectives),
      JSON.stringify(data.assessmentCriteria),
      data.startsOn ?? null,
      data.dueOn ?? null,
      data.simulationHours,
      new Date().toISOString(),
      row.id,
    )
    setAssignmentStudents(row.id, data.classId, data.assignTo)

    audit(req.user!.id, 'lecturer.assignment.update', `Updated "${data.title}"`)
    const updated = one<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', row.id)
    res.json({ assignment: updated ? toAssignment(updated) : null })
  }),
)

router.get(
  '/assignments/:id',
  wrap(async (req, res) => {
    const row = ownedAssignment(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That assignment does not exist.' })
      return
    }

    const progress = many<{
      student_id: string
      full_name: string
      email: string
      status: string
      submitted_at: string | null
      total_score: number | null
      grade: string | null
      feedback: string | null
    }>(
      `SELECT s.student_id, u.full_name, u.email, s.status, s.submitted_at,
              a.total_score, a.grade, a.feedback
       FROM assignment_students s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN (SELECT student_id, overall AS total_score, grade, feedback FROM assessments WHERE assignment_id = ?) a
         ON a.student_id = s.student_id
       WHERE s.assignment_id = ? ORDER BY u.full_name ASC`,
      row.id,
      row.id,
    )

    const classRow = one<ClassRow>('SELECT * FROM classes WHERE id = ?', row.class_id)

    res.json({
      assignment: toAssignment(row),
      className: classRow?.name ?? 'Class',
      progress: progress.map((entry) => ({
        studentId: entry.student_id,
        fullName: entry.full_name,
        email: entry.email,
        status: entry.status,
        submittedAt: entry.submitted_at,
        score: entry.total_score,
        grade: entry.grade,
        feedback: entry.feedback,
      })),
    })
  }),
)

router.post(
  '/assignments/:id/status',
  wrap(async (req, res) => {
    const row = ownedAssignment(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That assignment does not exist.' })
      return
    }
    const parsed = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown status.' })
      return
    }
    if (row.status === parsed.data.status) {
      res.status(400).json({ error: `That assignment is already ${parsed.data.status.toLowerCase()}.` })
      return
    }
    run('UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?', parsed.data.status, new Date().toISOString(), row.id)
    audit(req.user!.id, 'lecturer.assignment.status', `Set "${row.title}" to ${parsed.data.status}`)
    const updated = one<AssignmentRow>('SELECT * FROM assignments WHERE id = ?', row.id)
    res.json({ assignment: updated ? toAssignment(updated) : null })
  }),
)

router.delete(
  '/assignments/:id',
  wrap(async (req, res) => {
    const row = ownedAssignment(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That assignment does not exist.' })
      return
    }
    run('DELETE FROM assignments WHERE id = ?', row.id)
    audit(req.user!.id, 'lecturer.assignment.delete', `Deleted "${row.title}"`)
    res.json({ ok: true })
  }),
)

/* ---------------------------------------------------------------- scenarios -- */

router.get(
  '/scenarios',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const rows = many<ScenarioRow>(
      'SELECT * FROM scenarios WHERE lecturer_id = ? ORDER BY created_at DESC',
      lecturerId,
    )
    const classes = many<ClassRow>('SELECT id, name FROM classes WHERE lecturer_id = ?', lecturerId)
    const className = new Map(classes.map((c) => [c.id, c.name]))

    res.json({
      scenarios: rows.map((row) => ({ ...toScenario(row), className: className.get(row.class_id ?? '') ?? null })),
      templates: scenarioTemplates(),
      total: rows.length,
      running: rows.filter((row) => row.status === 'RUNNING').length,
    })
  }),
)

const scenarioSchema = z.object({
  classId: z.string().trim().min(1, 'Choose the class this scenario runs for.').nullish(),
  name: z.string().trim().min(2, 'Name the scenario.').max(90),
  template: z.enum(SCENARIO_TEMPLATES),
  description: z.string().trim().max(800).default(''),
  rates: z.object({
    inflationRate: z.number().min(-50).max(200).nullish(),
    interestRate: z.number().min(0).max(100).nullish(),
    supplierCost: z.number().min(-100).max(400).nullish(),
    customerDemand: z.number().min(-100).max(400).nullish(),
    competition: z.number().min(-100).max(400).nullish(),
    operatingCost: z.number().min(-100).max(400).nullish(),
    fundingClimate: z.enum(['tight', 'neutral', 'favourable']).nullish(),
  }),
  durationHours: z.number().int().min(1).max(24 * 30),
  evaluationCriteria: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
})

router.post(
  '/scenarios',
  wrap(async (req, res) => {
    const parsed = scenarioSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the scenario details.' })
      return
    }
    const data = parsed.data
    if (data.classId && !ownedClass(data.classId, req.user!.id)) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const id = newId()
    const now = new Date().toISOString()
    run(
      `INSERT INTO scenarios
         (id, lecturer_id, class_id, name, template, description, inflation_rate, interest_rate, supplier_cost,
          customer_demand, competition, operating_cost, funding_climate, duration_hours, evaluation_criteria,
          status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      id,
      req.user!.id,
      data.classId ?? null,
      data.name,
      data.template,
      data.description,
      data.rates.inflationRate ?? null,
      data.rates.interestRate ?? null,
      data.rates.supplierCost ?? null,
      data.rates.customerDemand ?? null,
      data.rates.competition ?? null,
      data.rates.operatingCost ?? null,
      data.rates.fundingClimate ?? null,
      data.durationHours,
      JSON.stringify(data.evaluationCriteria),
      now,
      now,
    )

    audit(req.user!.id, 'lecturer.scenario.create', `Built the scenario "${data.name}"`)
    const row = one<ScenarioRow>('SELECT * FROM scenarios WHERE id = ?', id)
    res.status(201).json({ scenario: row ? toScenario(row) : null })
  }),
)

router.put(
  '/scenarios/:id',
  wrap(async (req, res) => {
    const row = ownedScenario(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That scenario does not exist.' })
      return
    }
    if (row.status === 'RUNNING') {
      res.status(400).json({ error: 'End the scenario before editing it.' })
      return
    }
    const parsed = scenarioSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the scenario details.' })
      return
    }
    const data = parsed.data
    if (data.classId && !ownedClass(data.classId, req.user!.id)) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    run(
      `UPDATE scenarios SET class_id = ?, name = ?, template = ?, description = ?, inflation_rate = ?,
         interest_rate = ?, supplier_cost = ?, customer_demand = ?, competition = ?, operating_cost = ?,
         funding_climate = ?, duration_hours = ?, evaluation_criteria = ?, updated_at = ? WHERE id = ?`,
      data.classId ?? null,
      data.name,
      data.template,
      data.description,
      data.rates.inflationRate ?? null,
      data.rates.interestRate ?? null,
      data.rates.supplierCost ?? null,
      data.rates.customerDemand ?? null,
      data.rates.competition ?? null,
      data.rates.operatingCost ?? null,
      data.rates.fundingClimate ?? null,
      data.durationHours,
      JSON.stringify(data.evaluationCriteria),
      new Date().toISOString(),
      row.id,
    )

    audit(req.user!.id, 'lecturer.scenario.update', `Updated the scenario "${data.name}"`)
    const updated = one<ScenarioRow>('SELECT * FROM scenarios WHERE id = ?', row.id)
    res.json({ scenario: updated ? toScenario(updated) : null })
  }),
)

/**
 * Starts or ends a scenario.
 *
 * Only one scenario may run per class at a time: two competing sets of economic
 * conditions would make the students' results impossible to interpret.
 */
router.post(
  '/scenarios/:id/status',
  wrap(async (req, res) => {
    const row = ownedScenario(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That scenario does not exist.' })
      return
    }
    const parsed = z.object({ status: z.enum(['RUNNING', 'ENDED']) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown status.' })
      return
    }

    const now = new Date()
    if (parsed.data.status === 'RUNNING') {
      if (!row.class_id) {
        res.status(400).json({ error: 'Choose a class before running this scenario.' })
        return
      }
      const clash = one<{ id: string; name: string }>(
        "SELECT id, name FROM scenarios WHERE class_id = ? AND status = 'RUNNING' AND id != ?",
        row.class_id,
        row.id,
      )
      if (clash) {
        res.status(400).json({ error: `"${clash.name}" is already running for that class.` })
        return
      }
      run(
        "UPDATE scenarios SET status = 'RUNNING', started_at = ?, ends_at = ?, updated_at = ? WHERE id = ?",
        now.toISOString(),
        new Date(now.getTime() + Number(row.duration_hours) * 3_600_000).toISOString(),
        now.toISOString(),
        row.id,
      )
      audit(req.user!.id, 'lecturer.scenario.start', `Started the scenario "${row.name}"`)
    } else {
      run(
        "UPDATE scenarios SET status = 'ENDED', ends_at = ?, updated_at = ? WHERE id = ?",
        now.toISOString(),
        now.toISOString(),
        row.id,
      )
      audit(req.user!.id, 'lecturer.scenario.end', `Ended the scenario "${row.name}"`)
    }

    const updated = one<ScenarioRow>('SELECT * FROM scenarios WHERE id = ?', row.id)
    res.json({ scenario: updated ? toScenario(updated) : null })
  }),
)

router.delete(
  '/scenarios/:id',
  wrap(async (req, res) => {
    const row = ownedScenario(String(req.params.id), req.user!.id)
    if (!row) {
      res.status(404).json({ error: 'That scenario does not exist.' })
      return
    }
    if (row.status === 'RUNNING') {
      res.status(400).json({ error: 'End the scenario before deleting it.' })
      return
    }
    run('DELETE FROM scenarios WHERE id = ?', row.id)
    audit(req.user!.id, 'lecturer.scenario.delete', `Deleted the scenario "${row.name}"`)
    res.json({ ok: true })
  }),
)

/* ------------------------------------------------------------ live classroom -- */

router.get(
  '/live',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)
    const requested = typeof req.query.classId === 'string' ? req.query.classId : ''
    const classId = classIds.includes(requested) ? requested : classIds[0]

    if (!classId) {
      res.json({ class: null, participants: [], summary: null, events: [], scenarios: [] })
      return
    }

    const classRow = ownedClass(classId, lecturerId)!
    const participants = many<StudentRow>(
      `${STUDENT_SELECT} WHERE m.class_id = ? AND m.status = 'ACTIVE' ORDER BY u.full_name ASC`,
      classId,
    ).map(toStudent)

    const online = participants.filter((p) => isRecent(p.lastSeenAt, 5)).length
    const withBusiness = participants.filter((p) => p.hasBusiness).length
    const averageLevel =
      participants.length === 0
        ? 0
        : participants.reduce((sum, p) => sum + (p.levelIndex ?? 0), 0) / participants.length
    const averageXp =
      participants.length === 0 ? 0 : participants.reduce((sum, p) => sum + p.xp, 0) / participants.length

    const assignments = many<{ id: string; title: string; due_on: string | null; status: string }>(
      'SELECT id, title, due_on, status FROM assignments WHERE class_id = ? ORDER BY created_at DESC',
      classId,
    )
    const assignmentIds = assignments.map((a) => a.id)
    const setRows = assignmentIds.length
      ? many<{ assignment_id: string; student_id: string; status: string }>(
          `SELECT assignment_id, student_id, status FROM assignment_students WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})`,
          ...assignmentIds,
        )
      : []

    // A student's live view joins their progress to how far they have got with
    // the class's work, so the lecturer can compare responses side by side.
    const now = Date.now()
    const rows = participants.map((participant) => {
      const mine = setRows.filter((s) => s.student_id === participant.id)
      const overdue = mine.filter((s) => {
        if (s.status === 'SUBMITTED' || s.status === 'GRADED') return false
        const assignment = assignments.find((a) => a.id === s.assignment_id)
        return assignment?.due_on ? Date.parse(assignment.due_on) < now : false
      }).length

      return {
        ...participant,
        active: isRecent(participant.lastSeenAt, 5),
        tasksAssigned: mine.length,
        tasksSubmitted: mine.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
        overdue,
      }
    })

    const events = many<{
      id: string
      name: string
      kind: string
      scope: string
      impact: number
      status: string
      starts_at: string | null
      ends_at: string | null
    }>(
      `SELECT id, name, kind, scope, impact, status, starts_at, ends_at FROM simulation_events
       WHERE scope = 'all' OR (scope = 'class' AND targets LIKE ?) ORDER BY created_at DESC LIMIT 30`,
      `%${classId}%`,
    ).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      scope: row.scope,
      impact: Number(row.impact),
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }))

    const scenarios = many<ScenarioRow>(
      'SELECT * FROM scenarios WHERE lecturer_id = ? AND class_id = ? ORDER BY created_at DESC',
      lecturerId,
      classId,
    ).map(toScenario)

    res.json({
      class: toClass(classRow),
      participants: rows,
      summary: {
        students: participants.length,
        online,
        withBusiness,
        averageLevel,
        averageXp,
        submitted: setRows.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED').length,
        assigned: setRows.length,
      },
      events,
      scenarios,
    })
  }),
)

/** The events a lecturer may introduce: the simulation's own controlled set. */
router.post(
  '/live/:classId/events',
  wrap(async (req, res) => {
    const classRow = ownedClass(String(req.params.classId), req.user!.id)
    if (!classRow) {
      res.status(404).json({ error: 'That class does not exist.' })
      return
    }

    const parsed = z
      .object({
        kind: z.enum([
          'fuel_price',
          'supplier_disruption',
          'inflation_spike',
          'interest_rate',
          'demand_decline',
          'regulatory_change',
          'currency_fluctuation',
          'festive_demand',
        ]),
        name: z.string().trim().min(2, 'Name the event.').max(90),
        description: z.string().trim().max(500).default(''),
        impact: z.number().min(-100).max(400),
        durationHours: z.number().int().min(1).max(24 * 14),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the event details.' })
      return
    }

    const data = parsed.data
    const id = newId()
    const now = new Date()
    const nowIso = now.toISOString()

    // Scoped to this class and started immediately: a lecturer's control is
    // bounded to their own classroom, and the event expires on its own.
    run(
      `INSERT INTO simulation_events
         (id, name, kind, description, scope, targets, impact, duration_hours, starts_at, ends_at, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, 'class', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      id,
      data.name,
      data.kind,
      data.description,
      JSON.stringify([classRow.id]),
      data.impact,
      data.durationHours,
      nowIso,
      new Date(now.getTime() + data.durationHours * 3_600_000).toISOString(),
      nowIso,
      nowIso,
      req.user!.id,
    )

    audit(req.user!.id, 'lecturer.live.event', `Introduced "${data.name}" to ${classRow.name}`)
    res.status(201).json({ ok: true, id })
  }),
)

/* ------------------------------------------------ performance and assessment -- */

router.get(
  '/performance',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)
    const classId = typeof req.query.classId === 'string' && classIds.includes(req.query.classId)
      ? req.query.classId
      : ''

    const scope = classId ? [classId] : classIds
    const students = scope.length
      ? many<StudentRow>(
          `${STUDENT_SELECT} WHERE m.class_id IN (${scope.map(() => '?').join(',')}) AND m.status = 'ACTIVE'`,
          ...scope,
        )
      : []

    const studentIds = students.map((s) => s.id)
    const averages = assessmentAverages(lecturerId)

    const perStudent = students.map((student) => {
      const average = averages.get(student.id)
      return { ...toStudent(student), assessment: average ?? null }
    })

    res.json({
      students: perStudent,
      dimensions: dimensionAverages(studentIds, lecturerId),
      graded: perStudent.filter((s) => s.assessment !== null).length,
      total: perStudent.length,
      classId: classId || null,
      classes: many<ClassRow>('SELECT * FROM classes WHERE lecturer_id = ? ORDER BY name ASC', lecturerId).map(toClass),
    })
  }),
)

const assessmentSchema = z.object({
  assignmentId: z.string().trim().min(1).nullish(),
  studentId: z.string().trim().min(1, 'Choose a student.'),
  scores: z.record(z.string(), z.number().min(0).max(100)),
  feedback: z.string().trim().max(2000).default(''),
})

router.put(
  '/assessments',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const parsed = assessmentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the marks you entered.' })
      return
    }
    const data = parsed.data

    const dimensions = ASSESSMENT_DIMENSIONS.map((d) => d.key)
    const scores: Partial<Record<string, number>> = {}
    for (const [key, value] of Object.entries(data.scores)) {
      if (dimensions.includes(key as (typeof dimensions)[number])) scores[key] = value
    }
    if (Object.keys(scores).length === 0) {
      res.status(400).json({ error: 'Mark at least one assessment dimension.' })
      return
    }

    // The student must be in one of this lecturer's classes.
    const classIds = lecturerClassIds(lecturerId)
    if (classIds.length === 0) {
      res.status(404).json({ error: 'That student is not in your classes.' })
      return
    }
    const membership = one<{ id: string }>(
      `SELECT id FROM class_members WHERE student_id = ? AND status = 'ACTIVE'
       AND class_id IN (${classIds.map(() => '?').join(',')}) LIMIT 1`,
      data.studentId,
      ...classIds,
    )
    if (!membership) {
      res.status(404).json({ error: 'That student is not in your classes.' })
      return
    }

    if (data.assignmentId && !ownedAssignment(data.assignmentId, lecturerId)) {
      res.status(404).json({ error: 'That assignment does not exist.' })
      return
    }

    const overall = averageScore(scores as Partial<Record<(typeof dimensions)[number], number>>)!
    const grade = gradeFor(overall)
    const now = new Date().toISOString()

    const existing = one<{ id: string }>(
      'SELECT id FROM assessments WHERE assignment_id IS ? AND student_id = ? AND lecturer_id = ?',
      data.assignmentId ?? null,
      data.studentId,
      lecturerId,
    )

    if (existing) {
      run(
        'UPDATE assessments SET scores = ?, overall = ?, grade = ?, feedback = ?, updated_at = ? WHERE id = ?',
        JSON.stringify(scores),
        overall,
        grade,
        data.feedback,
        now,
        existing.id,
      )
    } else {
      run(
        `INSERT INTO assessments (id, assignment_id, student_id, lecturer_id, scores, overall, grade, feedback, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        data.assignmentId ?? null,
        data.studentId,
        lecturerId,
        JSON.stringify(scores),
        overall,
        grade,
        data.feedback,
        now,
        now,
      )
    }

    if (data.assignmentId) {
      run(
        "UPDATE assignment_students SET status = 'GRADED', submitted_at = COALESCE(submitted_at, ?) WHERE assignment_id = ? AND student_id = ?",
        now,
        data.assignmentId,
        data.studentId,
      )
    }

    run(
      'INSERT INTO notifications (id, user_id, title, body, kind, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      newId(),
      data.studentId,
      `New grade: ${grade}`,
      `Your work was assessed at ${Math.round(overall)}%. ${data.feedback}`.trim(),
      'grade',
      now,
    )

    audit(lecturerId, 'lecturer.assessment.save', `Assessed a student at ${Math.round(overall)}% (${grade})`)
    res.json({ ok: true, overall, grade })
  }),
)

/* ---------------------------------------------------------------- reporting -- */

interface ReportStudent {
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
  assessment: { overall: number | null; count: number; grade: string } | null
  strengths: { key: string; label: string; score: number }[]
  weaknesses: { key: string; label: string; score: number }[]
  feedback: string
}

/**
 * Builds the report for one student or a whole class.
 *
 * Strengths and weaknesses are read from the assessment dimensions rather than
 * from XP or cash, so a report describes how a student worked, not just how
 * much they accumulated.
 */
function buildReports(lecturerId: string, classId: string | null) {
  const classIds = classId ? [classId] : lecturerClassIds(lecturerId)
  if (classIds.length === 0) return []

  const students = many<StudentRow>(
    `${STUDENT_SELECT} WHERE m.class_id IN (${classIds.map(() => '?').join(',')}) AND m.status = 'ACTIVE'`,
    ...classIds,
  )
  const averages = assessmentAverages(lecturerId)
  const studentIds = students.map((s) => s.id)
  const placeholders = studentIds.map(() => '?').join(',')

  const assessmentRows = studentIds.length
    ? many<{ student_id: string; scores: string; feedback: string }>(
        `SELECT student_id, scores, feedback FROM assessments
         WHERE lecturer_id = ? AND student_id IN (${placeholders}) ORDER BY updated_at DESC`,
        lecturerId,
        ...studentIds,
      )
    : []

  const byStudent = new Map<string, { scores: Partial<Record<string, number>>; feedback: string }>()
  for (const row of assessmentRows) {
    if (byStudent.has(row.student_id)) continue
    byStudent.set(row.student_id, { scores: parseScores(row.scores), feedback: row.feedback })
  }

  return students.map((student): ReportStudent => {
    const entry = byStudent.get(student.id)
    const dimensionScores: { key: string; label: string; score: number }[] = entry
      ? ASSESSMENT_DIMENSIONS.flatMap((d) => {
          const score = entry.scores[d.key]
          return typeof score === 'number'
            ? [{ key: d.key as string, label: d.label, score }]
            : []
        })
      : []

    const sorted = [...dimensionScores].sort((a, b) => b.score - a.score)
    const average = averages.get(student.id)

    return {
      id: student.id,
      fullName: student.full_name,
      email: student.email,
      businessName: student.business_name,
      sector: student.sector,
      levelIndex: student.level_index,
      stageIndex: student.stage_index,
      xp: student.xp ?? 0,
      cash: student.cash ?? 0,
      reputation: student.reputation ?? 0,
      completedLevels: parseStringList(student.completed_levels).length,
      assessment: average ?? null,
      strengths: sorted.slice(0, 3),
      weaknesses: [...sorted].reverse().slice(0, 3),
      feedback: entry?.feedback ?? '',
    }
  })
}

router.get(
  '/reports',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)
    const classId = typeof req.query.classId === 'string' && classIds.includes(req.query.classId)
      ? req.query.classId
      : ''
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : ''

    let reports = buildReports(lecturerId, classId || null)
    if (studentId) reports = reports.filter((report) => report.id === studentId)

    const graded = reports.filter((report) => report.assessment !== null)
    const classAverage =
      graded.length === 0
        ? null
        : graded.reduce((sum, report) => sum + (report.assessment!.overall ?? 0), 0) / graded.length

    res.json({
      reports,
      scope: { classId: classId || null, studentId: studentId || null },
      summary: {
        students: reports.length,
        graded: graded.length,
        classAverage,
        withBusiness: reports.filter((report) => report.businessName !== null).length,
      },
      classes: many<ClassRow>('SELECT * FROM classes WHERE lecturer_id = ? ORDER BY name ASC', lecturerId).map(toClass),
      generatedAt: new Date().toISOString(),
    })
  }),
)

/** The same report as a CSV download, for the lecturer's own records. */
router.get(
  '/reports/export',
  wrap(async (req, res) => {
    const lecturerId = req.user!.id
    const classIds = lecturerClassIds(lecturerId)
    const classId = typeof req.query.classId === 'string' && classIds.includes(req.query.classId)
      ? req.query.classId
      : ''

    const reports = buildReports(lecturerId, classId || null)

    const columns = [
      'Student',
      'Email',
      'Company',
      'Sector',
      'Stage',
      'Level',
      'Levels completed',
      'XP',
      'Cash on hand',
      'Reputation',
      'Assessment average',
      'Grade',
      'Strengths',
      'Weaknesses',
      'Feedback',
    ]

    const escape = (value: string | number | null) => {
      const text = value === null ? '' : String(value)
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    const lines = [columns.join(',')]
    for (const report of reports) {
      lines.push(
        [
          report.fullName,
          report.email,
          report.businessName,
          report.sector,
          report.stageIndex,
          report.levelIndex,
          report.completedLevels,
          report.xp,
          report.cash,
          report.reputation,
          report.assessment?.overall === null || report.assessment?.overall === undefined
            ? ''
            : Math.round(report.assessment.overall),
          report.assessment?.grade ?? '',
          report.strengths.map((s) => `${s.label} (${s.score})`).join('; '),
          report.weaknesses.map((s) => `${s.label} (${s.score})`).join('; '),
          report.feedback,
        ]
          .map(escape)
          .join(','),
      )
    }

    const filename = `businesslife-${classId ? 'class' : 'all-classes'}-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(lines.join('\n'))
  }),
)

/* ------------------------------------------------------------ notifications -- */

router.get(
  '/notifications',
  wrap(async (req, res) => {
    const rows = many<{ id: string; title: string; body: string; kind: string; read: number; created_at: string }>(
      'SELECT id, title, body, kind, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      req.user!.id,
    )
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        kind: row.kind,
        read: row.read === 1,
        createdAt: row.created_at,
      })),
      unread: rows.filter((row) => row.read === 0).length,
    })
  }),
)

router.post(
  '/notifications/read',
  wrap(async (req, res) => {
    const parsed = z.object({ id: z.string().trim().min(1).nullish() }).safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: 'Unknown notification.' })
      return
    }
    if (parsed.data.id) {
      run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', parsed.data.id, req.user!.id)
    } else {
      run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user!.id)
    }
    res.json({ ok: true })
  }),
)

/* ----------------------------------------------------------------- settings -- */

router.get(
  '/settings',
  wrap(async (req, res) => {
    const user = req.user!
    const teaching = {
      classes: one<{ n: number }>('SELECT COUNT(*) AS n FROM classes WHERE lecturer_id = ?', user.id),
      students: one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM class_members m JOIN classes c ON c.id = m.class_id
         WHERE c.lecturer_id = ? AND m.status = 'ACTIVE'`,
        user.id,
      ),
      assignments: one<{ n: number }>('SELECT COUNT(*) AS n FROM assignments WHERE lecturer_id = ?', user.id),
      scenarios: one<{ n: number }>('SELECT COUNT(*) AS n FROM scenarios WHERE lecturer_id = ?', user.id),
    }

    res.json({
      profile: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      teaching: {
        classes: Number(teaching.classes?.n ?? 0),
        students: Number(teaching.students?.n ?? 0),
        assignments: Number(teaching.assignments?.n ?? 0),
        scenarios: Number(teaching.scenarios?.n ?? 0),
      },
    })
  }),
)

router.put(
  '/settings',
  wrap(async (req, res) => {
    const parsed = z.object({ fullName: z.string().trim().min(2, 'Enter your name.').max(80) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details.' })
      return
    }
    run('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?', parsed.data.fullName, new Date().toISOString(), req.user!.id)
    audit(req.user!.id, 'lecturer.settings.update', 'Updated their teaching profile')
    res.json({ ok: true, fullName: parsed.data.fullName })
  }),
)

export default router
