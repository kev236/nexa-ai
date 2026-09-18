import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getPromoteFunBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  await verifySession()

  let businessId: string
  try {
    businessId = (await getPromoteFunBusiness()).id
  } catch {
    return (
      <>
        <Nav active="campaigns" />
        <div className="page-header">
          <h1>Campaigns</h1>
        </div>
        <EmptyState
          icon={Megaphone}
          title="No 'promote-fun' business registered yet"
          hint={
            <>
              run <code className="mono">npm run db:register-business -- promote-fun &quot;Promote.fun&quot;</code> first
            </>
          }
        />
      </>
    )
  }

  const campaigns = await getEngine().campaignStore.listByBusiness(businessId)

  return (
    <>
      <Nav active="campaigns" />
      <div className="page-header">
        <h1>Campaigns</h1>
        <p className="subtitle">
          Imported campaign briefs, normalized by the Campaign Agent. Generate scored content concepts for any
          campaign, then review them here — nothing renders or publishes yet.
        </p>
      </div>

      <div className="opportunities-toolbar deck-enter">
        <Link href="/campaigns/new" className="button-link">
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns imported yet" />
      ) : (
        <div className="deck-enter" style={{ animationDelay: '0.1s' }}>
          {campaigns.map((c) => (
            <Link href={`/campaigns/${c.id}`} key={c.id} className="card-link">
              <div className="card">
                <div className="card-header">
                  <span className="action-type">{c.product}</span>
                  <span className={`status-badge status-${c.status === 'active' ? 'active' : 'inactive'}`}>
                    {c.status}
                  </span>
                </div>
                {c.problem && <p className="reasoning">{c.problem}</p>}
                <p className="meta">
                  {c.targetAudience && `For ${c.targetAudience} · `}
                  {new Date(c.createdAt).toLocaleDateString()}
                  {c.externalId && ` · ${c.externalId}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
