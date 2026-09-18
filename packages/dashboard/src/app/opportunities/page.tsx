import Link from 'next/link'
import { Target } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { setOpportunityStatus } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { DiscoverOpportunitiesButton } from '@/components/DiscoverOpportunitiesButton'

export const dynamic = 'force-dynamic'

export default async function OpportunitiesPage() {
  await verifySession()
  const opportunities = await getEngine().opportunityStore.list()
  const open = opportunities.filter((o) => o.status === 'open')
  const archived = opportunities.filter((o) => o.status === 'archived')

  return (
    <>
      <Nav active="opportunities" />
      <div className="page-header">
        <h1>Opportunities</h1>
        <p className="subtitle">
          The 12-dimension scoring format from the Nexa AI vision doc — score one yourself, or have the
          Opportunity Discovery Agent propose a batch (marked &ldquo;discovered&rdquo; below). Highest score first.
        </p>
      </div>

      <div className="opportunities-toolbar deck-enter">
        <Link href="/opportunities/new" className="button-link">
          New opportunity
        </Link>
        <DiscoverOpportunitiesButton />
      </div>

      <section className="deck-enter" style={{ animationDelay: '0.1s' }}>
        <h2 className="section-title">Open ({open.length})</h2>
        {open.length === 0 ? (
          <EmptyState icon={Target} title="Nothing scored yet" />
        ) : (
          open.map((o) => (
            <div className="card" key={o.id}>
              <div className="card-header">
                <span className="action-type-row">
                  <span className="action-type">{o.name}</span>
                  {o.proposedByAgentId && <span className="status-badge status-requested">discovered</span>}
                </span>
                <span className="score-badge">
                  <AnimatedNumber value={o.totalScore} />
                  /100
                </span>
              </div>
              <p className="reasoning">{o.problem}</p>
              <p className="meta">
                For {o.targetCustomer} · recommendation: {o.recommendation}
              </p>
              <div className="actions">
                <Link href={`/opportunities/${o.id}/edit`} className="button-link">
                  Edit
                </Link>
                <form action={setOpportunityStatus.bind(null, o.id, 'archived')}>
                  <button type="submit" className="deny">
                    Archive
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="deck-enter" style={{ animationDelay: '0.2s' }}>
          <h2 className="section-title">Archived ({archived.length})</h2>
          {archived.map((o) => (
            <div className="card" key={o.id}>
              <div className="card-header">
                <span className="action-type-row">
                  <span className="action-type">{o.name}</span>
                  {o.proposedByAgentId && <span className="status-badge status-requested">discovered</span>}
                </span>
                <span className="score-badge">
                  <AnimatedNumber value={o.totalScore} />
                  /100
                </span>
              </div>
              <p className="reasoning">{o.problem}</p>
              <p className="meta">
                For {o.targetCustomer} · recommendation: {o.recommendation}
              </p>
              <div className="actions">
                <form action={setOpportunityStatus.bind(null, o.id, 'open')}>
                  <button type="submit" className="approve">
                    Reopen
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
