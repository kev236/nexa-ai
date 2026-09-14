import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { resolveApproval } from '@/app/actions'
import { Nav } from '@/components/Nav'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  await verifySession()
  const pending = await getEngine().listPendingApprovals()

  return (
    <>
      <Nav active="approvals" />
      <div className="page-header">
        <h1>Pending approvals</h1>
        <p className="subtitle">
          {pending.length === 0
            ? 'Nothing waiting on you.'
            : `${pending.length} action${pending.length === 1 ? '' : 's'} waiting for a decision.`}
        </p>
      </div>

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
