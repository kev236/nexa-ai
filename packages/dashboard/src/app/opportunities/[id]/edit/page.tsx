import { notFound } from 'next/navigation'
import { SCORE_DIMENSIONS } from '@nexa-ai/permission-engine'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { updateOpportunity } from '@/app/actions'
import { Nav } from '@/components/Nav'
import { OpportunityForm } from '@/components/OpportunityForm'

export const dynamic = 'force-dynamic'

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await verifySession()
  const { id } = await params
  const opportunity = await getEngine().opportunityStore.get(id)
  if (!opportunity) notFound()

  return (
    <>
      <Nav active="opportunities" />
      <div className="page-header">
        <h1>Edit opportunity</h1>
        <p className="subtitle">Score every dimension 0-100 — higher always means more favorable.</p>
      </div>
      <div className="deck-enter">
        <OpportunityForm
          action={updateOpportunity.bind(null, id)}
          dimensions={SCORE_DIMENSIONS}
          initial={opportunity}
          submitLabel="Save changes"
        />
      </div>
    </>
  )
}
