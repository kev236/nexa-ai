import { verifySession } from '@/lib/dal'
import { Nav } from '@/components/Nav'
import { CampaignForm } from '@/components/CampaignForm'

export default async function NewCampaignPage() {
  await verifySession()

  return (
    <>
      <Nav active="campaigns" />
      <div className="page-header">
        <h1>New campaign</h1>
        <p className="subtitle">
          Manual import today — CSV import is npm run db:import-campaign at the CLI. Both go through the same
          Campaign Agent.
        </p>
      </div>
      <CampaignForm />
    </>
  )
}
