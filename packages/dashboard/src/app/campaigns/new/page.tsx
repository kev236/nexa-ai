import { verifySession } from '@/lib/dal'
import { Nav } from '@/components/Nav'
import { CampaignForm } from '@/components/CampaignForm'
import { CAMPAIGN_BUSINESSES, resolveCampaignBusinessSlug } from '../business'

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>
}) {
  await verifySession()
  const { business: businessParam } = await searchParams
  const businessSlug = resolveCampaignBusinessSlug(businessParam)
  const businessLabel = CAMPAIGN_BUSINESSES.find((b) => b.slug === businessSlug)?.label ?? businessSlug

  return (
    <>
      <Nav active="campaigns" />
      <div className="page-header">
        <h1>New campaign — {businessLabel}</h1>
        <p className="subtitle">
          Manual import today — CSV import is npm run db:import-campaign at the CLI. Both go through the same
          Campaign Agent.
        </p>
      </div>
      <div className="deck-enter">
        <CampaignForm businessSlug={businessSlug} />
      </div>
    </>
  )
}
