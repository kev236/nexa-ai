import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { gaugeCircumference, gaugeDashoffset } from '@/lib/radialGauge'
import { LiveClock } from '@/components/LiveClock'
import { BrainCircuit } from 'lucide-react'

export const dynamic = 'force-dynamic'

// The real model every Nexa AI agent calls (src/llm/client.ts's MODEL
// constant in @nexa-ai/permission-engine) — shown because it's true,
// not because it reads well. This page never invents a stat: every
// number below is a real value this request actually fetched.
const MODEL_LABEL = 'Claude Opus 5'

const GAUGE_RADIUS = 42
const GAUGE_CIRCUMFERENCE = gaugeCircumference(GAUGE_RADIUS)

/**
 * A standalone, full-bleed "command center" view of real Nexa AI data —
 * built for recording a demo clip, deliberately separate from the
 * Approvals dashboard so neither page has to compromise for the other.
 * No sidebar, no voice UI, no fabricated system diagnostics: the visual
 * treatment is maximalist, the data underneath it is exactly as real as
 * everywhere else in this app.
 */
export default async function DemoPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()

  const [pending, agents, feed, opportunities] = await Promise.all([
    engine.listPendingApprovals(),
    engine.agentStore.listByBusiness(business.id),
    engine.auditStore.listByBusiness(business.id, 12),
    engine.opportunityStore.list(),
  ])

  const activeAgents = agents.filter((a) => a.active).length
  const topOpportunity = opportunities
    .filter((o) => o.status === 'open')
    .sort((a, b) => b.totalScore - a.totalScore)[0]
  const agentsPct = agents.length ? (activeAgents / agents.length) * 100 : 0

  return (
    <div className="demo-page">
      <div className="demo-topbar demo-enter" style={{ animationDelay: '0.05s' }}>
        <div className="demo-brand">
          <BrainCircuit size={22} className="demo-brand-icon" aria-hidden />
          <span className="demo-brand-text">Nexa AI</span>
        </div>
        <span className="demo-tagline">Autonomous business operations</span>
        <span className="demo-topbar-clock mono">
          <LiveClock />
        </span>
      </div>

      <div className="demo-grid">
        <div className="hud-panel demo-enter" style={{ animationDelay: '0.15s' }}>
          <div className="hud-panel-header">
            <span className="hud-panel-title">Agent roster</span>
            <span className="hud-panel-badge">
              {activeAgents}/{agents.length}
            </span>
          </div>
          {agents.length === 0 ? (
            <p className="empty">No agents registered yet.</p>
          ) : (
            <ul className="signal-feed">
              {agents.map((agent) => (
                <li className="signal-feed-item" key={agent.id}>
                  {agent.active ? (
                    <span className="pulse-dot pulse-dot--inline" aria-hidden />
                  ) : (
                    <span className="signal-dot--off" aria-hidden />
                  )}
                  <span className="agent-key">{agent.key}</span>
                  <span className={agent.active ? 'status-badge status-active' : 'status-badge status-inactive'}>
                    {agent.active ? 'active' : 'idle'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="meter demo-meter">
            <div className="meter-label">
              <span>Fleet online</span>
              <span className="mono">{Math.round(agentsPct)}%</span>
            </div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${agentsPct}%` }} />
            </div>
          </div>
        </div>

        <div className="demo-core-wrap demo-enter" style={{ animationDelay: '0.3s' }}>
          <div className="demo-core">
            <div className="demo-core-ring demo-core-ring--outer" aria-hidden />
            <div className="demo-core-ring demo-core-ring--mid" aria-hidden />
            <div className="demo-core-ring demo-core-ring--inner" aria-hidden />
            <div className="demo-core-center">
              <span className="demo-core-brand">Nexa</span>
              <span className="demo-core-pending">{pending.length}</span>
              <span className="demo-core-label">pending</span>
            </div>
          </div>
          <div className="demo-core-status">
            <span className="pulse-dot" aria-hidden />
            <span className="mono">{business.name.toUpperCase()} · OPERATIONAL</span>
          </div>
        </div>

        <div className="hud-panel demo-enter" style={{ animationDelay: '0.15s' }}>
          <div className="hud-panel-header">
            <span className="hud-panel-title">Top opportunity</span>
          </div>
          {topOpportunity ? (
            <>
              <div className="growth-gauge demo-gauge">
                <svg viewBox="0 0 100 100" className="growth-gauge-svg" role="img" aria-label={`${topOpportunity.totalScore} of 100`}>
                  <circle cx="50" cy="50" r={GAUGE_RADIUS} className="growth-gauge-track" />
                  <circle
                    cx="50"
                    cy="50"
                    r={GAUGE_RADIUS}
                    className="growth-gauge-fill"
                    strokeDasharray={GAUGE_CIRCUMFERENCE}
                    strokeDashoffset={gaugeDashoffset(topOpportunity.totalScore, GAUGE_CIRCUMFERENCE)}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="growth-gauge-label">
                  <span className="growth-count">{topOpportunity.totalScore}</span>
                  <span className="meta">/ 100</span>
                </div>
              </div>
              <p className="demo-opportunity-name">{topOpportunity.name}</p>
            </>
          ) : (
            <p className="empty">Nothing scored yet.</p>
          )}
        </div>
      </div>

      <div className="hud-panel demo-feed-panel demo-enter" style={{ animationDelay: '0.45s' }}>
        <div className="hud-panel-header">
          <span className="hud-panel-title">Live activity feed</span>
          <span className="hud-panel-badge">{feed.length} recent</span>
        </div>
        {feed.length === 0 ? (
          <p className="empty">Nothing observed yet.</p>
        ) : (
          <ul className="signal-feed demo-feed">
            {feed.map((record) => (
              <li className="signal-feed-item" key={record.id}>
                <span className="signal-tag">{record.status}</span>
                <span className="action-type">{record.actionType}</span>
                <span className="meta">
                  {new Date(record.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="demo-statusbar demo-enter" style={{ animationDelay: '0.6s' }}>
        <span>{pending.length} pending</span>
        <span className="demo-statusbar-sep" aria-hidden>
          ·
        </span>
        <span>
          {activeAgents}/{agents.length} agents online
        </span>
        <span className="demo-statusbar-sep" aria-hidden>
          ·
        </span>
        <span>{MODEL_LABEL}</span>
      </div>
    </div>
  )
}
