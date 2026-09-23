import { KeyRound } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getApiKeyStore } from '@/lib/engine'
import { relativeTime } from '@/lib/format'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { CreateApiKeyForm } from '@/components/CreateApiKeyForm'
import { revokeApiKeyAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Step 30: manage keys for the clip-scoring API product
 * (api/v1/score-clip/route.ts) — not tied to any business, this is its
 * own small product. Billing is manual: generate a key after getting
 * paid outside this system, send it to the customer, revoke it if they
 * stop paying. No Stripe wiring here yet, deliberately — see this
 * route's own comment.
 */
export default async function ApiKeysPage() {
  await verifySession()
  const keys = await getApiKeyStore().listAll()

  return (
    <>
      <Nav active="api-keys" />
      <div className="page-header">
        <h1>API Keys</h1>
        <p className="subtitle">
          Access to the clip-scoring API (<code className="mono">POST /api/v1/score-clip</code>) — the same
          evaluation TrendRush&apos;s own Clip Discovery Agent runs, exposed for anyone paying for it. Billing is
          manual for now: generate a key once someone&apos;s paid, revoke it when they stop.
        </p>
      </div>

      <div className="deck-enter">
        <CreateApiKeyForm />
      </div>

      {keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No keys issued yet" />
      ) : (
        <div className="deck-enter" style={{ animationDelay: '0.1s', marginTop: '1.5rem' }}>
          {keys.map((key) => (
            <div className="card" key={key.id}>
              <div className="card-header">
                <span className="action-type-row">
                  <span className="concept-title">{key.name}</span>
                  <span className={key.revokedAt ? 'status-badge status-denied' : 'status-badge status-active'}>
                    {key.revokedAt ? 'revoked' : 'active'}
                  </span>
                </span>
                <span className="meta mono">id: {key.id.slice(0, 8)}</span>
              </div>
              <p className="meta">
                {key.requestCount} request{key.requestCount === 1 ? '' : 's'}
                {key.lastUsedAt ? ` · last used ${relativeTime(key.lastUsedAt)}` : ' · never used'} · created{' '}
                {relativeTime(key.createdAt)}
              </p>
              {!key.revokedAt && (
                <form action={revokeApiKeyAction.bind(null, key.id)}>
                  <button type="submit" className="deny">
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
