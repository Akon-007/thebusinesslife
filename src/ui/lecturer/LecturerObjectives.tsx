import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import { copyText, type AssignmentsPayload } from './api'

/**
 * Learning objectives.
 *
 * The server has no separate learning-objectives catalogue — objectives are the
 * lecturer's own words, held per assignment. This page therefore gathers the
 * objectives already written across your assignments, so they can be reused when
 * building the next one, and copied out for your records. It reads only from the
 * assignments endpoint; it does not invent a source that does not exist.
 */
export function LecturerObjectives() {
  const { data, loading, error, reload } = useApi<AssignmentsPayload>('/lecturer/assignments?status=ALL')
  const [copied, setCopied] = useState<string | null>(null)

  const assignments = data?.assignments ?? []

  const objectiveCounts = new Map<string, number>()
  const criterionCounts = new Map<string, number>()
  for (const assignment of assignments) {
    for (const objective of assignment.learningObjectives) {
      objectiveCounts.set(objective, (objectiveCounts.get(objective) ?? 0) + 1)
    }
    for (const criterion of assignment.assessmentCriteria) {
      criterionCounts.set(criterion, (criterionCounts.get(criterion) ?? 0) + 1)
    }
  }
  const objectives = [...objectiveCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const criteria = [...criterionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  async function copy(text: string, key: string) {
    const ok = await copyText(text)
    setCopied(ok ? key : null)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Learning Objectives</h1>
          <p>
            Every learning objective and assessment criterion you have written, gathered from your
            assignments. Reuse them when building new work, or copy them out for reporting.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Assignments" value={data ? formatNumber(assignments.length) : '—'} sub="Your own work" />
        <StatTile label="Objectives" value={data ? formatNumber(objectives.length) : '—'} sub="Distinct across assignments" tone="accent" />
        <StatTile label="Assessment criteria" value={data ? formatNumber(criteria.length) : '—'} sub="Distinct across assignments" />
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : objectives.length === 0 && criteria.length === 0 ? (
        <StateBlock
          loading={false}
          error={null}
          empty="You have not written any learning objectives yet. Add them when building an assignment."
        />
      ) : (
        <div className="pf-cols pf-cols--2">
          <Card
            title="Learning objectives"
            meta={
              objectives.length > 0 ? (
                <button
                  className="pf-btn pf-btn--ghost pf-btn--sm"
                  type="button"
                  onClick={() => copy(objectives.map(([text]) => text).join('\n'), 'all-objectives')}
                >
                  {copied === 'all-objectives' ? 'Copied' : 'Copy all'}
                </button>
              ) : (
                'None yet'
              )
            }
          >
            {objectives.length === 0 ? (
              <p className="pf-card__note">No learning objectives written yet.</p>
            ) : (
              <div className="pf-col-stack">
                {objectives.map(([text, count]) => (
                  <div className="pf-objective" key={text}>
                    <div className="pf-objective__head">
                      <span className="pf-objective__index">Used {count}×</span>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => copy(text, `o:${text}`)}
                      >
                        {copied === `o:${text}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p style={{ margin: 0 }}>{text}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Assessment criteria"
            meta={
              criteria.length > 0 ? (
                <button
                  className="pf-btn pf-btn--ghost pf-btn--sm"
                  type="button"
                  onClick={() => copy(criteria.map(([text]) => text).join('\n'), 'all-criteria')}
                >
                  {copied === 'all-criteria' ? 'Copied' : 'Copy all'}
                </button>
              ) : (
                'None yet'
              )
            }
          >
            {criteria.length === 0 ? (
              <p className="pf-card__note">No assessment criteria written yet.</p>
            ) : (
              <div className="pf-col-stack">
                {criteria.map(([text, count]) => (
                  <div className="pf-objective" key={text}>
                    <div className="pf-objective__head">
                      <span className="pf-objective__index">Used {count}×</span>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => copy(text, `c:${text}`)}
                      >
                        {copied === `c:${text}` ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p style={{ margin: 0 }}>{text}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Card title="Where these come from">
          <p className="pf-card__note">
            Learning objectives are held per assignment, not as a platform-wide list. To use one in a
            new assignment, copy it here and paste it into the{' '}
            <Link className="pf-row-link" to="/lecturer/assignments/new">
              assignment builder
            </Link>
            . The builder also offers your existing objectives as one-click suggestions.
          </p>
          <div className="pf-chips">
            {assignments.slice(0, 12).map((assignment) => (
              <Link className="pf-chip" key={assignment.id} to={`/lecturer/assignments/${assignment.id}`}>
                {assignment.title}
                <Badge>{assignment.learningObjectives.length}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
