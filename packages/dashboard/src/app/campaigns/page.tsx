import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { CAMPAIGN_BUSINESSES, resolveCampaignBusinessSlug } from './business'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>
}) {
  await verifySession()
  const { business: businessParam } = await searchParams
  const businessSlug = resolveCampaignBusinessSlug(businessParam)
  const activeLabel = CAMPAIGN_BUSINESSES.find((b) => b.slug === businessSlug)?.label ?? businessSlug

  const switcher = (
    <div className="campaign-business-switcher">
      {CAMPAIGN_BUSINESSES.map((b) => (
        <Link
          key={b.slug}
          href={`/campaigns?business=${b.slug}`}
          className={`campaign-business-pill${b.slug === businessSlug ? ' campaign-business-pill--active' : ''}`}
        >
          {b.label}
        </Link>
      ))}
    </div>
  )

  let businessId: string
  try {
    businessId = (await getBusiness(businessSlug)).id
  } catch {
    return (
      <>
        <Nav active="campaigns" />
        <div className="page-header">
          <h1>Campaigns</h1>
        </div>
        {switcher}
        <EmptyState
          icon={Megaphone}
          title={`No '${businessSlug}' business registered yet`}
          hint={
            <>
              run <code className="mono">npm run db:register-business -- {businessSlug} &quot;{activeLabel}&quot;</code>{' '}
              first
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

      {switcher}

      <div className="opportunities-toolbar deck-enter">
        <Link href={`/campaigns/new?business=${businessSlug}`} className="button-link">
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
