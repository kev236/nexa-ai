import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { formatAmount } from '@/lib/format'
import { Nav } from '@/components/Nav'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()
  const transactions = await engine.transactionStore.listByBusiness(business.id, 100)
  const recent = [...transactions].reverse()

  return (
    <>
      <Nav active="money" />
      <div className="page-header">
        <h1>Money</h1>
        <p className="subtitle">
          Observability only — nothing here creates a charge, refund, or payout. Charges/refunds/payouts from
          Stripe, and incoming/outgoing USDC transfers from a watched wallet.
        </p>
      </div>

      {recent.length === 0 ? (
        <p className="empty">
          No transactions observed yet — set STRIPE_SECRET_KEY and/or ETHERSCAN_API_KEY + WALLET_ADDRESS, then
          run db:backfill-nexalabs or wait for the next poll.
        </p>
      ) : (
        <div className="event-list">
          {recent.map((tx) => (
            <div className="event-item" key={tx.id}>
              <span className="action-type">{tx.type}</span>
              <span className="meta">{formatAmount(tx.amountCents, tx.currency)}</span>
              <span className={`status-badge status-${tx.status === 'succeeded' || tx.status === 'paid' ? 'executed' : 'requested'}`}>
                {tx.status}
              </span>
              {tx.externalRef && <span className="meta mono">{tx.externalRef}</span>}
              <span className="meta">{new Date(tx.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
