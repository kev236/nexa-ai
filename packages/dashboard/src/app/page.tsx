import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Users,
  Activity,
  Gauge,
  LayoutGrid,
  Target,
  Wallet,
  Megaphone,
  TrendingUp,
  Film,
  Sparkles,
  BrainCircuit,
  Banknote,
  Building2,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import {
  getBusiness,
  getPromoteFunBusiness,
  getSproutlightBusiness,
  getTrendRushBusiness,
  getDropshippingBusiness,
} from '@/lib/business'
import { formatAmount, displayNameFromEmail, relativeTime, humanizeActionType } from '@/lib/format'
import { gaugeCircumference, gaugeDashoffset } from '@/lib/radialGauge'
import { summarizeRevenue } from '@/lib/revenue'
import { sparklinePath } from '@/lib/sparkline'
import { resolveApproval } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { BootIntro } from '@/components/BootIntro'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { LiveClock } from '@/components/LiveClock'
import { HoloGlobe } from '@/components/HoloGlobe'
import { PLATFORMS, type BusinessRecord, type AuditLogRecord } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

// The real model every Nexa AI agent calls (src/llm/client.ts's MODEL
// constant in @nexa-ai/permission-engine) — shown on the status bar
// because it's true, not because it reads well.
const MODEL_LABEL = 'Claude Opus 5'

const GAUGE_RADIUS = 42
const GAUGE_CIRCUMFERENCE = gaugeCircumference(GAUGE_RADIUS)

// The Command Center's core ring is 68px across (see
// .command-center-core-ring) — this radius places each agent node
// exactly on that circumference, centered on the 90px
// .command-center-core box (.deck-core-node's own negative margin
// centers the dot on its own point).
const CORE_NODE_RADIUS = 34
const CORE_CENTER = 45

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

type BusinessCard = { name: string; href: string; label: string; value: string }

/**
 * The "My Businesses" row's real, per-business snapshot — each card is
 * one real metric from that business's own store, not a portfolio
 * summary invented for this row. A business that isn't registered yet
 * (same optional-business pattern as loadCampaignCount above) just
 * doesn't get a card, rather than showing a fake placeholder one.
 */
async function loadBusinessCard(
  loader: () => Promise<BusinessRecord>,
  href: string,
  computeMetric: (businessId: string) => Promise<{ label: string; value: string }>
): Promise<BusinessCard | undefined> {
  try {
    const business = await loader()
    const metric = await computeMetric(business.id)
    return { name: business.name, href, ...metric }
  } catch {
    return undefined
  }
}

/**
 * Real EUR revenue across every business with money-tracking configured
 * today (nexa-labs' Stripe/crypto, dropshipping's Shopify orders) — see
 * lib/revenue.ts for why this stays EUR-only rather than summing
 * currencies together. A business without transactions (or that isn't
 * registered) just contributes nothing, same optional pattern as
 * loadBusinessCard.
 */
async function loadRevenueOverview(engine: ReturnType<typeof getEngine>) {
  const businessIds: string[] = []
  try {
    businessIds.push((await getBusiness()).id)
  } catch {
    // nexa-labs not seeded — no revenue to show.
  }
  try {
    businessIds.push((await getDropshippingBusiness()).id)
  } catch {
    // dropshipping not registered yet — no revenue to show.
  }

  const transactions = (
    await Promise.all(businessIds.map((id) => engine.transactionStore.listByBusiness(id, 300)))
  ).flat()
  return summarizeRevenue(transactions)
}

/**
 * Real counts behind the "Automations" and "Attention needed" tiles —
 * see AGENTS.md/session notes on why these replace a fabricated
 * "Profit" tile (no cost data exists anywhere in this system to compute
 * one honestly). Automations = audit rows this business's agents have
 * actually executed, ever (a big listByBusiness batch, not just the
 * 12-row activity feed). Attention = things stuck, not things merely
 * pending your normal review — a crashed/killed run (listStaleRequested)
 * or a transaction nobody's looked at yet (listUnreviewed), across every
 * business with money-tracking configured.
 */
async function loadOperationsSummary(engine: ReturnType<typeof getEngine>, business: BusinessRecord) {
  const [bigBatch, stale, unreviewedNexaLabs] = await Promise.all([
    engine.auditStore.listByBusiness(business.id, 500),
    engine.auditStore.listStaleRequested(30 * 60 * 1000, 50),
    engine.transactionStore.listUnreviewed(business.id, 50),
  ])

  let unreviewedDropshippingCount = 0
  try {
    const dropshipping = await getDropshippingBusiness()
    unreviewedDropshippingCount = (await engine.transactionStore.listUnreviewed(dropshipping.id, 50)).length
  } catch {
    // dropshipping not registered yet — nothing unreviewed to add.
  }

  return {
    automationsCount: bigBatch.filter((r) => r.status === 'executed').length,
    issuesCount: stale.length + unreviewedNexaLabs.length + unreviewedDropshippingCount,
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
  const { ownerId } = await verifySession()
  const engine = getEngine()
  const business = await getBusiness()

  const [pending, agents, feed, latestTx, opportunities, campaignCount, owner, revenue, operations] =
    await Promise.all([
      engine.listPendingApprovals(),
      engine.agentStore.listByBusiness(business.id),
      engine.auditStore.listByBusiness(business.id, 12),
      engine.transactionStore.listByBusiness(business.id, 1),
      engine.opportunityStore.list(),
      loadCampaignCount(engine),
      engine.ownerStore.get(ownerId),
      loadRevenueOverview(engine),
      loadOperationsSummary(engine, business),
    ])

  const activeAgents = agents.filter((a) => a.active).length
  const latestTransaction = latestTx[0]
  const topOpportunity = opportunities
    .filter((o) => o.status === 'open')
    .sort((a, b) => b.totalScore - a.totalScore)[0]
  // Most recently requested pending approval, if any — the Command
  // Center's "needs your approval" highlight shows real decision data
  // (the agent's own real reasoning), never a fabricated number the way
  // a generic sci-fi HUD mockup would.
  const focusApproval = pending.length > 0 ? pending[pending.length - 1] : undefined
  const ownerName = owner ? displayNameFromEmail(owner.email) : undefined
  const allOperational = agents.length > 0 && activeAgents === agents.length

  const agentRoleById = new Map(agents.map((a) => [a.id, a.role]))
  // Command Center's real highlights — the two most recent things an
  // agent actually did, in the same recency order the audit log itself
  // already returns (see feed above), no invented "23% traffic increase"
  // style content the way a generic mockup would show.
  const executedHighlights = feed.filter((r): r is AuditLogRecord & { status: 'executed' } => r.status === 'executed').slice(0, 2)

  const businessCards = (
    await Promise.all([
      Promise.resolve<BusinessCard>({
        name: business.name,
        href: '/',
        label: 'Pending',
        value: `${pending.length}`,
      }),
      loadBusinessCard(getPromoteFunBusiness, '/campaigns', async () => ({
        label: 'Campaigns',
        value: campaignCount !== undefined ? `${campaignCount} active` : '—',
      })),
      loadBusinessCard(getSproutlightBusiness, '/story-concepts', async (id) => {
        const concepts = await engine.storyConceptStore.listByBusiness(id)
        return { label: 'Concepts', value: `${concepts.length} drafted` }
      }),
      loadBusinessCard(getTrendRushBusiness, '/growth', async (id) => {
        const accounts = await engine.socialAccountStore.listByBusiness(id)
        const eligible = PLATFORMS.every((p) => (accounts.find((a) => a.platform === p)?.followerCount ?? 0) >= 200)
        return { label: 'Promote.fun', value: eligible ? 'Eligible' : 'Growing' }
      }),
      loadBusinessCard(getDropshippingBusiness, '/transactions', async (id) => {
        const orders = await engine.transactionStore.listByBusiness(id, 300)
        const eurCents = orders
          .filter((t) => t.type === 'charge' && t.currency.toLowerCase() === 'eur')
          .reduce((sum, t) => sum + t.amountCents, 0)
        return { label: 'Orders revenue', value: formatAmount(eurCents, 'eur') }
      }),
    ])
  ).filter((card): card is BusinessCard => card !== undefined)

  const revenueSpark = sparklinePath(
    revenue.dailyCents.map((c) => c / 100),
    280,
    56,
  )

  return (
    <>
      <BootIntro />
      <Nav active="approvals" />
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <span className={allOperational ? 'system-status-pill' : 'system-status-pill system-status-pill--warn'}>
              {allOperational ? (
                <span className="pulse-dot" aria-hidden />
              ) : (
                <span className="status-dot--warn" aria-hidden />
              )}
              {agents.length === 0
                ? 'No agents registered'
                : allOperational
                  ? 'All systems operational'
                  : `${agents.length - activeAgents} agent${agents.length - activeAgents === 1 ? '' : 's'} offline`}
            </span>
            <h1>{ownerName ? `Welcome back, ${ownerName}.` : 'Dashboard'}</h1>
            <p className="subtitle">
              {pending.length === 0
                ? "Nothing waiting on you across your businesses."
                : `${pending.length} action${pending.length === 1 ? '' : 's'} waiting for a decision.`}
            </p>
          </div>
          <div className="page-header-meta">
            <span className="page-header-clock mono">
              <LiveClock />
            </span>
            {ownerName && (
              <div className="owner-chip">
                <span className="owner-chip-avatar" aria-hidden>
                  {ownerName.charAt(0).toUpperCase()}
                </span>
                <span className="owner-chip-text">
                  <span className="owner-chip-name">{ownerName}</span>
                  <span className="owner-chip-role">Owner</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="kpi-row deck-enter" style={{ animationDelay: '0.05s' }}>
        <Link href="/transactions" className="kpi-tile">
          <Banknote size={16} className="kpi-tile-icon" aria-hidden />
          <div className="kpi-tile-body">
            <span className="kpi-tile-label">Revenue (EUR)</span>
            <span className="kpi-tile-value">
              <AnimatedNumber value={Math.round(revenue.totalCents / 100)} />
            </span>
            {revenue.deltaPct !== undefined && (
              <span className={revenue.deltaPct >= 0 ? 'kpi-tile-delta kpi-tile-delta--up' : 'kpi-tile-delta kpi-tile-delta--down'}>
                {revenue.deltaPct >= 0 ? '+' : ''}
                {revenue.deltaPct.toFixed(0)}% today
              </span>
            )}
          </div>
        </Link>
        <Link href="/activity" className="kpi-tile">
          <Users size={16} className="kpi-tile-icon" aria-hidden />
          <div className="kpi-tile-body">
            <span className="kpi-tile-label">Active agents</span>
            <span className="kpi-tile-value">
              <AnimatedNumber value={activeAgents} />
              <span className="kpi-tile-value-of">/{agents.length}</span>
            </span>
          </div>
        </Link>
        <Link href="#businesses" className="kpi-tile">
          <Building2 size={16} className="kpi-tile-icon" aria-hidden />
          <div className="kpi-tile-body">
            <span className="kpi-tile-label">Businesses</span>
            <span className="kpi-tile-value">
              <AnimatedNumber value={businessCards.length} />
            </span>
          </div>
        </Link>
        <Link href="/activity" className="kpi-tile">
          <Zap size={16} className="kpi-tile-icon" aria-hidden />
          <div className="kpi-tile-body">
            <span className="kpi-tile-label">Automations</span>
            <span className="kpi-tile-value">
              <AnimatedNumber value={operations.automationsCount} />
            </span>
          </div>
        </Link>
        <Link href="/activity" className="kpi-tile">
          <AlertTriangle size={16} className={operations.issuesCount > 0 ? 'kpi-tile-icon kpi-tile-icon--warn' : 'kpi-tile-icon'} aria-hidden />
          <div className="kpi-tile-body">
            <span className="kpi-tile-label">Attention needed</span>
            <span className="kpi-tile-value">
              <AnimatedNumber value={operations.issuesCount} />
            </span>
          </div>
        </Link>
      </div>

      <div className="hud-grid">
        <div className="hud-col">
          <HudPanel icon={Banknote} title="Revenue overview" badge="last 7 days" className="deck-enter" style={{ animationDelay: '0.08s' }}>
            {revenueSpark ? (
              <svg viewBox="0 0 280 56" className="sparkline" preserveAspectRatio="none" role="img" aria-label="Revenue over the last 7 days">
                <polygon points={revenueSpark.area} className="sparkline-area" />
                <polyline points={revenueSpark.line} className="sparkline-line" />
                <circle cx={revenueSpark.last[0]} cy={revenueSpark.last[1]} r="3" className="sparkline-dot" />
              </svg>
            ) : (
              <p className="empty">No EUR revenue observed yet.</p>
            )}
          </HudPanel>

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
          <div className="command-center-panel deck-enter" style={{ animationDelay: '0.3s' }}>
            <span className="command-center-scan" aria-hidden />
            <div className="command-center-header">
              <div className="command-center-core">
                <HoloGlobe />
                <div className="command-center-core-ring" aria-hidden />
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
                <BrainCircuit size={18} className="command-center-core-icon" aria-hidden />
              </div>
              <div className="command-center-heading">
                <span className="deck-wordmark-text">NEXA AI</span>
                <span className="command-center-status">
                  Auto-executes everything except real spending — that always waits for you.
                </span>
              </div>
            </div>

            <p className="command-center-summary">
              Monitoring {businessCards.length} business{businessCards.length === 1 ? '' : 'es'} ·{' '}
              {activeAgents} agent{activeAgents === 1 ? '' : 's'} active ·{' '}
              {pending.length} approval{pending.length === 1 ? '' : 's'} required
            </p>

            <ul className="command-center-highlights">
              {executedHighlights.map((record) => (
                <li className="highlight-item" key={record.id}>
                  <span className="highlight-dot highlight-dot--active" aria-hidden />
                  <div className="highlight-body">
                    <span className="highlight-title">
                      {agentRoleById.get(record.agentId) ?? humanizeActionType(record.actionType)}
                    </span>
                    <span className="highlight-desc">{record.reasoning}</span>
                  </div>
                  <span className="meta">{relativeTime(record.resolvedAt ?? record.requestedAt)}</span>
                </li>
              ))}
              {topOpportunity && (
                <li className="highlight-item">
                  <span className="highlight-dot highlight-dot--accent" aria-hidden />
                  <div className="highlight-body">
                    <span className="highlight-title">Opportunity found — {topOpportunity.name}</span>
                    <span className="highlight-desc">{topOpportunity.recommendation}</span>
                  </div>
                  <span className="meta">{relativeTime(topOpportunity.createdAt)}</span>
                </li>
              )}
              {focusApproval && (
                <li className="highlight-item">
                  <span className="highlight-dot highlight-dot--warn" aria-hidden />
                  <div className="highlight-body">
                    <span className="highlight-title">Needs your approval</span>
                    <span className="highlight-desc">{humanizeActionType(focusApproval.request.actionType)} — {focusApproval.request.reasoning}</span>
                  </div>
                  <span className="meta">{relativeTime(focusApproval.createdAt)}</span>
                </li>
              )}
              {executedHighlights.length === 0 && !topOpportunity && !focusApproval && (
                <li className="empty">Nothing automated yet.</li>
              )}
            </ul>
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
          <ul className="activity-feed">
            {feed.map((record) => (
              <li className="activity-feed-item" key={record.id}>
                <span
                  className={
                    record.status === 'executed'
                      ? 'highlight-dot highlight-dot--active'
                      : record.status === 'denied'
                        ? 'highlight-dot highlight-dot--danger'
                        : record.status === 'abandoned'
                          ? 'highlight-dot highlight-dot--warn'
                          : 'highlight-dot highlight-dot--accent'
                  }
                  aria-hidden
                />
                <div className="highlight-body">
                  <span className="highlight-title">
                    {agentRoleById.get(record.agentId) ?? humanizeActionType(record.actionType)}
                  </span>
                  <span className="highlight-desc">{record.reasoning}</span>
                </div>
                <span className={`status-badge status-${record.status}`}>{record.status}</span>
                <span className="meta">{relativeTime(record.requestedAt)}</span>
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

      {businessCards.length > 0 && (
        <>
          <h2 className="section-title" id="businesses">
            My businesses
          </h2>
          <div className="business-row deck-enter" style={{ animationDelay: '0.6s' }}>
            {businessCards.map((card) => (
              <Link key={card.name} href={card.href} className="hud-panel business-card">
                <div className="business-card-name">{card.name}</div>
                <div className="business-card-metric-label">{card.label}</div>
                <div className="business-card-metric-value">{card.value}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Pending approvals</h2>
      {pending.length === 0 ? (
        <p className="empty">Nexa AI has no pending requests right now.</p>
      ) : (
        pending.map((approval) => {
          const approve = resolveApproval.bind(null, approval.id, 'approved')
          const deny = resolveApproval.bind(null, approval.id, 'denied')
          const cost = approval.request.expectedCost
          return (
            <div className="card approval-card" key={approval.id}>
              <div className="card-header">
                <span className="action-type">{humanizeActionType(approval.request.actionType)}</span>
                <span className="meta">
                  {agentRoleById.get(approval.request.agentId) ?? 'an agent'} ·{' '}
                  {new Date(approval.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="reasoning">{approval.request.reasoning}</p>
              {cost && (
                <div className="approval-cost">
                  <Banknote size={15} aria-hidden />
                  <span>Estimated cost: {formatAmount(cost.amountCents, cost.currency)}</span>
                </div>
              )}
              <details className="approval-details">
                <summary>Full request details</summary>
                <pre className="payload">{JSON.stringify(approval.request.payload, null, 2)}</pre>
              </details>
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
