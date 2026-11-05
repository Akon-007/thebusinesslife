import { useState } from 'react'
import { Badge, Card, StateBlock, StatTile, formatMoney, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import { getToken } from '../../api/client'
import { formatDateTime, type ReportsPayload } from './api'

/**
 * Reports.
 *
 * The on-screen report is built by the server from the assessment dimensions, so
 * a student's strengths and weaknesses describe how they worked rather than what
 * they accumulated. The same report can be downloaded as a CSV for the
 * lecturer's own records.
 */
export function LecturerReports() {
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const { data, loading, error, reload } = useApi<ReportsPayload>(
    `/lecturer/reports?classId=${encodeURIComponent(classId)}&studentId=${encodeURIComponent(studentId)}`,
  )

  async function downloadCsv() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const token = getToken()
      const response = await fetch(`/api/lecturer/reports/export?classId=${encodeURIComponent(classId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        throw new Error(`The export could not be prepared (${response.status}).`)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const match = /filename="?([^"]+)"?/.exec(disposition)
      const filename =
        match?.[1] ?? `businesslife-${classId ? 'class' : 'all-classes'}-${new Date().toISOString().slice(0, 10)}.csv`

      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'The export could not be downloaded.')
    } finally {
      setDownloading(false)
    }
  }

  const classList = data?.classes ?? []
  const reports = data?.reports ?? []

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Reports</h1>
          <p>
            A strength-and-weakness report for each student, built from the assessment dimensions.
            Report a whole class or a single student, and download the figures as a CSV.
          </p>
        </div>
        <div className="pf-actions">
          <select className="pf-select" value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId('') }}>
            <option value="">All my classes</option>
            {classList.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <select className="pf-select" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Whole class</option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.fullName}
              </option>
            ))}
          </select>
          <button className="pf-btn" type="button" disabled={downloading} onClick={downloadCsv}>
            {downloading ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </div>

      {downloadError && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{downloadError}</div>}

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : reports.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No students match this report scope." />
      ) : (
        <>
          <div className="pf-stats">
            <StatTile label="Students" value={formatNumber(data.summary.students)} sub={studentId ? 'Single student' : classId ? 'In this class' : 'Across your classes'} />
            <StatTile label="Assessed" value={formatNumber(data.summary.graded)} sub="With a mark" tone="accent" />
            <StatTile
              label="Class average"
              value={data.summary.classAverage === null ? '—' : `${Math.round(data.summary.classAverage)}%`}
              sub="Mean of assessed students"
            />
            <StatTile label="With a company" value={formatNumber(data.summary.withBusiness)} sub="Business created" />
          </div>

          <p className="pf-card__note" style={{ marginTop: 0 }}>
            Generated {formatDateTime(data.generatedAt)}.
          </p>

          <div className="pf-col-stack">
            {reports.map((report) => (
              <Card
                key={report.id}
                title={report.fullName}
                meta={
                  report.assessment ? (
                    <div className="pf-chips">
                      <Badge tone="good">
                        {Math.round(report.assessment.overall ?? 0)}% · {report.assessment.grade}
                      </Badge>
                      <Badge>{report.assessment.count} marked</Badge>
                    </div>
                  ) : (
                    <Badge tone="warn">Not assessed</Badge>
                  )
                }
              >
                <div className="pf-inline-stats">
                  <span>{report.email}</span>
                  <span>{report.businessName ?? 'No company yet'}{report.sector ? ` · ${report.sector}` : ''}</span>
                  <span>Level {report.levelIndex ?? '—'} · stage {report.stageIndex ?? '—'}</span>
                  <span>{formatNumber(report.xp)} XP · {formatMoney(report.cash)}</span>
                </div>

                <div className="pf-cols pf-cols--2" style={{ marginTop: 12 }}>
                  <div>
                    <div className="pf-preview__label">Strengths</div>
                    {report.strengths.length === 0 ? (
                      <p className="pf-card__note">No marks to draw strengths from.</p>
                    ) : (
                      <ul className="pf-preview__list">
                        {report.strengths.map((strength) => (
                          <li key={strength.key}>
                            {strength.label} — <strong>{Math.round(strength.score)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="pf-preview__label">Weaknesses</div>
                    {report.weaknesses.length === 0 ? (
                      <p className="pf-card__note">No marks to draw weaknesses from.</p>
                    ) : (
                      <ul className="pf-preview__list">
                        {report.weaknesses.map((weakness) => (
                          <li key={weakness.key}>
                            {weakness.label} — <strong>{Math.round(weakness.score)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="pf-preview__label">Feedback</div>
                <p className="pf-preview__body">
                  {report.feedback || <span className="pf-muted">No written feedback recorded.</span>}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
