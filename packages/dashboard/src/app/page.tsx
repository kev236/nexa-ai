import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness, getPromoteFunBusiness } from '@/lib/business'
import { formatAmount } from '@/lib/format'
import { resolveApproval } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { BootIntro } from '@/components/BootIntro'
import { AnimatedNumber } from '@/components/AnimatedNumber'

export const dynamic = 'force-dynamic'

/**
 * Campaigns live under the 'promote-fun' business (see lib/business.ts),
 * which — unlike 'nexa-labs' — isn't guaranteed to exist yet (it's only
 * created by running db:register-business). Guarded the same way the
 * optional executor/notifier setup in engine.ts is: a business that
 * hasn't been set up yet shouldn't take the whole dashboard down, it
 * should just make this one tile say so.
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

export default async function ApprovalsPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()

  const [pending, agents, latestAudit, latestTx, opportunities, campaignCount] = await Promise.all([
    engine.listPendingApprovals(),
    engine.agentStore.listByBusiness(business.id),
    engine.auditStore.listByBusiness(business.id, 1),
    engine.transactionStore.listByBusiness(business.id, 1),
    engine.opportunityStore.list(),
    loadCampaignCount(engine),
  ])

  const activeAgents = agents.filter((a) => a.active).length
  const latestActivity = latestAudit[0]
  const latestTransaction = latestTx[0]
  const topOpportunity = opportunities
    .filter((o) => o.status === 'open')
    .sort((a, b) => b.totalScore - a.totalScore)[0]

  return (
    <>
      <BootIntro />
      <Nav active="approvals" />
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">
          {pending.length === 0
            ? 'Nothing waiting on you.'
            : `${pending.length} action${pending.length === 1 ? '' : 's'} waiting for a decision.`}
        </p>
      </div>

      <div className="bento-grid">
        <div className="bento-tile bento-tile--hero">
          <div className="hero-ring" aria-hidden />
          <div className="bento-tile-label">Pending</div>
          <div className="bento-tile-value">
            <AnimatedNumber value={pending.length} />
          </div>
          <div className="bento-tile-meta">
            {pending.length === 0 ? 'nothing waiting on you' : `waiting for a decision`}
          </div>
        </div>

        <Link href="/activity" className="bento-tile-link">
          <div className="bento-tile">
            <div className="bento-tile-label">Agents</div>
            <div className="bento-tile-value">
              <AnimatedNumber value={activeAgents} suffix={`/${agents.length}`} />
            </div>
            <div className="bento-tile-meta">
              <span className="pulse-dot pulse-dot--inline" aria-hidden />
              active
            </div>
          </div>
        </Link>

        <Link href="/activity" className="bento-tile-link">
          <div className="bento-tile">
            <div className="bento-tile-label">Latest activity</div>
            <div className="bento-tile-value">{latestActivity ? latestActivity.actionType : '—'}</div>
            <div className="bento-tile-meta">
              {latestActivity
                ? `${latestActivity.status} · ${new Date(latestActivity.requestedAt).toLocaleDateString()}`
                : 'nothing yet'}
            </div>
          </div>
        </Link>

        <Link href="/transactions" className="bento-tile-link">
          <div className="bento-tile">
            <div className="bento-tile-label">Money</div>
            <div className="bento-tile-value">
              {latestTransaction ? formatAmount(latestTransaction.amountCents, latestTransaction.currency) : '—'}
            </div>
            <div className="bento-tile-meta">{latestTransaction ? latestTransaction.type : 'no transactions yet'}</div>
          </div>
        </Link>

        <Link href="/opportunities" className="bento-tile-link">
          <div className="bento-tile">
            <div className="bento-tile-label">Top opportunity</div>
            <div className="bento-tile-value">
              {topOpportunity ? (
                <>
                  <AnimatedNumber value={topOpportunity.totalScore} suffix="/100" />
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="bento-tile-meta">{topOpportunity ? topOpportunity.name : 'nothing scored yet'}</div>
          </div>
        </Link>

        <Link href="/campaigns" className="bento-tile-link bento-tile--wide">
          <div className="bento-tile">
            <div>
              <div className="bento-tile-label">Campaigns</div>
              <div className="bento-tile-value">
                {campaignCount === undefined ? '—' : <AnimatedNumber value={campaignCount} />}
              </div>
            </div>
            <div className="bento-tile-meta">{campaignCount === undefined ? 'not set up yet' : 'active'}</div>
          </div>
        </Link>
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
