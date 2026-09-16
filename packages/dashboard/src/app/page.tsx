import Link from 'next/link'
import type { ReactNode } from 'react'
import { Users, Activity, Gauge, LayoutGrid, Target, Wallet, Megaphone, TrendingUp, Film, Sparkles, BrainCircuit } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness, getPromoteFunBusiness } from '@/lib/business'
import { formatAmount } from '@/lib/format'
import { gaugeCircumference, gaugeDashoffset } from '@/lib/radialGauge'
import { resolveApproval } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { BootIntro } from '@/components/BootIntro'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { LiveClock } from '@/components/LiveClock'

export const dynamic = 'force-dynamic'

// The real model every Nexa AI agent calls (src/llm/client.ts's MODEL
// constant in @nexa-ai/permission-engine) — shown on the status bar
// because it's true, not because it reads well.
const MODEL_LABEL = 'Claude Opus 5'

const GAUGE_RADIUS = 42
const GAUGE_CIRCUMFERENCE = gaugeCircumference(GAUGE_RADIUS)

// The core's mid ring is 160px across (see .deck-core-ring--mid) —
// this radius places each agent node exactly on that circumference,
// centered on the 200px .deck-core box (.deck-core-node's own
// negative margin centers the dot on its own point).
const CORE_NODE_RADIUS = 80
const CORE_CENTER = 100

function coreNodePosition(index: number, total: number): { left: number; top: number } {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return {
    left: CORE_CENTER + CORE_NODE_RADIUS * Math.cos(angle),
    top: CORE_CENTER + CORE_NODE_RADIUS * Math.sin(angle),
  }
}

/**
 * Campaigns live under the 'promote-fun' business (see lib/business.ts),
 * which — unlike 'nexa-labs' — isn't guaranteed to exist yet (it's only
 * created by running db:register-business). Guarded the same way the
 * optional executor/notifier setup in engine.ts is: a business that
 * hasn't been set up yet shouldn't take the whole dashboard down, it
 * should just make this one panel say so.
 */
async function loadCampaignCount(engine: ReturnType<typeof getEngine>): Promise<number | undefined> {
  try {
    const promoteFun = await getPromoteFunBusiness()
    const campaigns = await engine.campaignStore.listByBusiness(promoteFun.id, 200)
    return campaigns.filter((c) => c.status === 'active').length
  } catch {
    return undefined
  }
}

function HudPanel({
  icon: Icon,
  title,
  badge,
  children,
  className,
  style,
}: {
  icon: typeof Users
  title: string
  badge?: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={className ? `hud-panel ${className}` : 'hud-panel'} style={style}>
      <div className="hud-panel-header">
        <Icon size={15} className="hud-panel-icon" aria-hidden />
        <span className="hud-panel-title">{title}</span>
        {badge && <span className="hud-panel-badge">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

export default async function ApprovalsPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()

  const [pending, agents, feed, latestTx, opportunities, campaignCount] = await Promise.all([
    engine.listPendingApprovals(),
    engine.agentStore.listByBusiness(business.id),
    engine.auditStore.listByBusiness(business.id, 12),
    engine.transactionStore.listByBusiness(business.id, 1),
    engine.opportunityStore.list(),
    loadCampaignCount(engine),
  ])

  const activeAgents = agents.filter((a) => a.active).length
  const latestActivity = feed[0]
  const latestTransaction = latestTx[0]
  const topOpportunity = opportunities
    .filter((o) => o.status === 'open')
    .sort((a, b) => b.totalScore - a.totalScore)[0]
  // Most recently requested pending approval, if any — the reactor's
  // "focus" readout shows real decision data (a real confidence score,
  // when the agent that drafted it supplied one), never a fabricated
  // number the way a generic sci-fi HUD mockup would.
  const focusApproval = pending.length > 0 ? pending[pending.length - 1] : undefined

  return (
    <>
      <BootIntro />
      <Nav active="approvals" />
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">
              {pending.length === 0
                ? 'Nothing waiting on you.'
                : `${pending.length} action${pending.length === 1 ? '' : 's'} waiting for a decision.`}
            </p>
          </div>
          <span className="page-header-clock mono">
            <LiveClock />
          </span>
        </div>
      </div>

      <div className="hud-grid">
        <div className="hud-col">
          <HudPanel icon={Users} title="Agent roster" badge={`${activeAgents}/${agents.length}`} className="deck-enter" style={{ animationDelay: '0.1s' }}>
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
          </HudPanel>

          <HudPanel icon={Target} title="Top opportunity" className="deck-enter" style={{ animationDelay: '0.2s' }}>
            {topOpportunity ? (
              <>
                <div className="growth-gauge deck-gauge">
                  <svg
                    viewBox="0 0 100 100"
                    className="growth-gauge-svg"
                    role="img"
                    aria-label={`${topOpportunity.totalScore} of 100`}
                  >
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
                <p className="deck-opportunity-name">{topOpportunity.name}</p>
              </>
            ) : (
              <p className="empty">Nothing scored yet.</p>
            )}
          </HudPanel>
        </div>

        <div className="hud-col">
          <div className="reactor-panel deck-enter" style={{ animationDelay: '0.3s' }}>
            <div className="deck-core-wrap">
              <div className="deck-core">
                <div className="deck-core-ring deck-core-ring--outer" aria-hidden />
                <div className="deck-core-ring deck-core-ring--mid" aria-hidden />
                {agents.map((agent, index) => {
                  const { left, top } = coreNodePosition(index, agents.length)
                  return (
                    <span
                      key={agent.id}
                      className={agent.active ? 'deck-core-node deck-core-node--active' : 'deck-core-node'}
                      style={{ left: `${left}px`, top: `${top}px` }}
                      aria-hidden
                    />
                  )
                })}
                <div className="deck-core-center">
                  <BrainCircuit size={26} className="deck-core-icon" aria-hidden />
                  <span className="deck-core-pending">
                    <AnimatedNumber value={pending.length} />
                  </span>
                  <span className="deck-core-label">pending</span>
                </div>
              </div>
            </div>

            {focusApproval ? (
              <div className="reactor-readout">
                <span className="reactor-readout-label">focus</span>
                <span className="action-type">{focusApproval.request.actionType}</span>
                {typeof focusApproval.request.confidence === 'number' && (
                  <span className="reactor-readout-confidence">
                    confidence {Math.round(focusApproval.request.confidence * 100)}%
                  </span>
                )}
              </div>
            ) : latestActivity ? (
              <div className="reactor-readout">
                <span className="reactor-readout-label">last</span>
                <span className="action-type">{latestActivity.actionType}</span>
                <span className={`status-badge status-${latestActivity.status}`}>{latestActivity.status}</span>
              </div>
            ) : (
              <p className="empty">Nothing observed yet.</p>
            )}
          </div>
        </div>

        <div className="hud-col">
          <HudPanel icon={Gauge} title="System metrics" className="deck-enter" style={{ animationDelay: '0.2s' }}>
            <div className="meter">
              <div className="meter-label">
                <span>Agents online</span>
                <span className="mono">
                  {activeAgents}/{agents.length}
                </span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: `${agents.length ? (activeAgents / agents.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="meter-readout">
              <span className="meter-readout-label">Latest money</span>
              <span className="meter-readout-value">
                {latestTransaction ? formatAmount(latestTransaction.amountCents, latestTransaction.currency) : '—'}
              </span>
            </div>
            <div className="meter-readout">
              <span className="meter-readout-label">Campaigns active</span>
              <span className="meter-readout-value">{campaignCount ?? '—'}</span>
            </div>
          </HudPanel>

          <HudPanel icon={LayoutGrid} title="Quick access" className="deck-enter" style={{ animationDelay: '0.3s' }}>
            <div className="command-grid">
              <Link href="/transactions" className="command-btn">
                <Wallet size={16} aria-hidden />
                <span>Money</span>
              </Link>
              <Link href="/opportunities" className="command-btn">
                <Target size={16} aria-hidden />
                <span>Opportunities</span>
              </Link>
              <Link href="/campaigns" className="command-btn">
                <Megaphone size={16} aria-hidden />
                <span>Campaigns</span>
              </Link>
              <Link href="/growth" className="command-btn">
                <TrendingUp size={16} aria-hidden />
                <span>Growth</span>
              </Link>
              <Link href="/clips" className="command-btn">
                <Film size={16} aria-hidden />
                <span>Clips</span>
              </Link>
              <Link href="/story-concepts" className="command-btn">
                <Sparkles size={16} aria-hidden />
                <span>Sproutlight</span>
              </Link>
              <Link href="/activity" className="command-btn">
                <Activity size={16} aria-hidden />
                <span>Activity</span>
              </Link>
            </div>
          </HudPanel>
        </div>
      </div>

      <HudPanel icon={Activity} title="Live activity feed" badge={`${feed.length} recent`} className="deck-feed-panel deck-enter" style={{ animationDelay: '0.4s' }}>
        {feed.length === 0 ? (
          <p className="empty">Nothing observed yet.</p>
        ) : (
          <ul className="signal-feed deck-feed">
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
      </HudPanel>

      <div className="deck-statusbar deck-enter" style={{ animationDelay: '0.5s' }}>
        <span>{pending.length} pending</span>
        <span className="deck-statusbar-sep" aria-hidden>
          ·
        </span>
        <span>
          {activeAgents}/{agents.length} agents online
        </span>
        <span className="deck-statusbar-sep" aria-hidden>
          ·
        </span>
        <span>{MODEL_LABEL}</span>
      </div>

      <h2 className="section-title">Pending approvals</h2>
      {pending.length === 0 ? (
        <p className="empty">Nexa AI has no pending requests right now.</p>
      ) : (
        pending.map((approval) => {
          const approve = resolveApproval.bind(null, approval.id, 'approved')
          const deny = resolveApproval.bind(null, approval.id, 'denied')
          return (
            <div className="card" key={approval.id}>
              <div className="card-header">
                <span className="action-type">{approval.request.actionType}</span>
                <span className="meta">
                  agent {approval.request.agentId} · business {approval.request.businessId} ·{' '}
                  {new Date(approval.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="reasoning">{approval.request.reasoning}</p>
              <pre className="payload">{JSON.stringify(approval.request.payload, null, 2)}</pre>
              <div className="actions">
                <form action={approve}>
                  <button type="submit" className="approve">
                    Approve
                  </button>
                </form>
                <form action={deny}>
                  <button type="submit" className="deny">
                    Deny
                  </button>
                </form>
              </div>
            </div>
          )
        })
      )}
    </>
  )
}
