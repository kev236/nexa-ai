import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import type { AgentRecord, ApprovalRecord, AuditLogRecord } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

function lastActivityFor(agent: AgentRecord, feed: AuditLogRecord[]): AuditLogRecord | undefined {
  // feed is most-recent-first, so the first match for this agent is its latest.
  return feed.find((r) => r.agentId === agent.id)
}

/**
 * Step 18: an executed record with an approval that has no resolvedBy
 * auto-executed rather than waiting on the owner — everything except a
 * money-spending action does, by default (see engine.ts's
 * shouldAutoApprove). Surfacing that distinction here is what keeps
 * auto-approval transparent instead of invisible.
 */
function approvalLabel(record: AuditLogRecord, approvalsByAuditId: Map<string, ApprovalRecord>): string | undefined {
  if (record.status !== 'executed') return undefined
  const approval = approvalsByAuditId.get(record.id)
  if (!approval) return undefined
  return approval.resolvedBy ? 'approved by owner' : 'auto-approved by policy'
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Buckets the audit feed already fetched for this page into the last 7
 * calendar days — real request volume, not a synthetic readout. The
 * feed is capped at 50 rows (see the Promise.all below), so on a very
 * busy week this undercounts older days in that window rather than
 * lying about a day having zero activity; acceptable for an at-a-glance
 * shape, not a rigorous report.
 */
function last7DayCounts(feed: AuditLogRecord[]) {
  const days: { key: string; label: string; count: number }[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({ key: d.toISOString().slice(0, 10), label: DAY_LABELS[d.getDay()], count: 0 })
  }
  const byKey = new Map(days.map((d) => [d.key, d]))
  for (const record of feed) {
    const key = new Date(record.requestedAt).toISOString().slice(0, 10)
    const bucket = byKey.get(key)
    if (bucket) bucket.count += 1
  }
  return days
}

export default async function ActivityPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()

  const [agents, feed, events, approvals] = await Promise.all([
    engine.agentStore.listByBusiness(business.id),
    engine.auditStore.listByBusiness(business.id, 50),
    engine.eventStore.listByBusiness(business.id, 10),
    engine.approvalStore.listByBusiness(business.id, 50),
  ])
  const recentEvents = [...events].reverse()
  const approvalsByAuditId = new Map(approvals.map((a) => [a.auditId, a]))
  const weekCounts = last7DayCounts(feed)
  const weekMax = Math.max(1, ...weekCounts.map((d) => d.count))

  return (
    <>
      <Nav active="activity" />
      <div className="page-header">
        <h1>Activity</h1>
        <p className="subtitle">What every agent has done, and what's come in.</p>
      </div>

      <div className="bar-chart" role="img" aria-label="Requests per day, last 7 days">
        {weekCounts.map((day) => (
          <div className="bar-chart-col" key={day.key}>
            <span className="bar-chart-count">{day.count > 0 ? day.count : ''}</span>
            <div className="bar-chart-bar" style={{ height: `${(day.count / weekMax) * 100}%` }} />
            <span className="bar-chart-label">{day.label}</span>
          </div>
        ))}
      </div>

      <section>
        <h2 className="section-title">Agents</h2>
        {agents.length === 0 ? (
          <p className="empty">No agents registered yet — run db:register-agent.</p>
        ) : (
          <div className="agent-strip">
            {agents.map((agent) => {
              const last = lastActivityFor(agent, feed)
              return (
                <div className="agent-card" key={agent.id}>
                  <div className="agent-card-header">
                    <span className="agent-key">{agent.key}</span>
                    <span className={agent.active ? 'status-badge status-active' : 'status-badge status-inactive'}>
                      {agent.active && <span className="pulse-dot pulse-dot--inline" aria-hidden />}
                      {agent.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <p className="agent-role">{agent.role}</p>
                  {last ? (
                    <p className="meta">
                      last: <span className={`status-badge status-${last.status}`}>{last.status}</span>{' '}
                      {new Date(last.requestedAt).toLocaleString()}
                    </p>
                  ) : (
                    <p className="meta">no activity yet</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Recently observed</h2>
        {recentEvents.length === 0 ? (
          <p className="empty">No events observed yet — run db:backfill-nexalabs, or wait for the next poll.</p>
        ) : (
          <div className="event-list">
            {recentEvents.map((event) => {
              const payload = event.payload
              const email =
                typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof payload.email === 'string'
                  ? payload.email
                  : undefined
              return (
                <div className="event-item" key={event.id}>
                  <span className="action-type">{event.type}</span>
                  {email && <span className="meta">{email}</span>}
                  <span className="meta">{new Date(event.occurredAt).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Audit log</h2>
        {feed.length === 0 ? (
          <p className="empty">Nothing requested yet.</p>
        ) : (
          feed.map((record) => {
            const label = approvalLabel(record, approvalsByAuditId)
            return (
              <div className="card" key={record.id}>
                <div className="card-header">
                  <span className="action-type">{record.actionType}</span>
                  <span className="meta">
                    agent {record.agentId} · {new Date(record.requestedAt).toLocaleString()}
                  </span>
                </div>
                <p className="reasoning">{record.reasoning}</p>
                <p className="meta">
                  <span className={`status-badge status-${record.status}`}>{record.status}</span>
                  {record.status === 'denied' && record.deniedReason ? ` — ${record.deniedReason}` : null}
                  {record.status === 'abandoned' && record.abandonedReason ? ` — ${record.abandonedReason}` : null}
                  {label ? ` — ${label}` : null}
                </p>
              </div>
            )
          })
        )}
      </section>
    </>
  )
}
