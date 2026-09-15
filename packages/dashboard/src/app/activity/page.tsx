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
 * Step 11: an executed record with an approval that has no resolvedBy was
 * never seen by a human — the owner pre-authorized it via autonomy level 2
 * config (see engine.ts's shouldAutoApprove). Surfacing that distinction
 * here is what keeps auto-approval transparent instead of invisible.
 */
function approvalLabel(record: AuditLogRecord, approvalsByAuditId: Map<string, ApprovalRecord>): string | undefined {
  if (record.status !== 'executed') return undefined
  const approval = approvalsByAuditId.get(record.id)
  if (!approval) return undefined
  return approval.resolvedBy ? 'approved by owner' : 'auto-approved by policy'
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

  return (
    <>
      <Nav active="activity" />
      <div className="page-header">
        <h1>Activity</h1>
        <p className="subtitle">What every agent has done, and what's come in.</p>
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
                      {agent.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <p className="agent-role">{agent.role}</p>
                  <p className="meta">autonomy level {agent.autonomyLevel}</p>
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
