import { SCORE_DIMENSIONS } from '@nexa-ai/permission-engine'
import { verifySession } from '@/lib/dal'
import { createOpportunity } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { OpportunityForm } from '@/components/OpportunityForm'

export default async function NewOpportunityPage() {
  await verifySession()

  return (
    <>
      <Nav active="opportunities" />
      <div className="page-header">
        <h1>New opportunity</h1>
        <p className="subtitle">Score every dimension 0-100 — higher always means more favorable.</p>
      </div>
      <div className="deck-enter">
        <OpportunityForm action={createOpportunity} dimensions={SCORE_DIMENSIONS} submitLabel="Save opportunity" />
      </div>
    </>
  )
}
