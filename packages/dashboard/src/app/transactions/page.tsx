import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { formatAmount } from '@/lib/format'
import { sparklinePath } from '@/lib/sparkline'
import { Nav } from '@/components/Nav'

export const dynamic = 'force-dynamic'

const SPARK_WIDTH = 640
const SPARK_HEIGHT = 72

export default async function TransactionsPage() {
  await verifySession()
  const engine = getEngine()
  const business = await getBusiness()
  const transactions = await engine.transactionStore.listByBusiness(business.id, 100)
  const recent = [...transactions].reverse()

  // Real amounts, oldest-first, same slice already fetched above — a
  // trend line for what's already on the page, not a new query.
  const spark = sparklinePath(
    recent.map((t) => t.amountCents / 100),
    SPARK_WIDTH,
    SPARK_HEIGHT,
  )

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

      {spark && (
        <div className="chart-card">
          <div className="chart-card-header">
            <span className="section-title" style={{ marginBottom: 0 }}>
              Transaction trend
            </span>
            <span className="meta">last {recent.length} observed</span>
          </div>
          <svg
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            className="sparkline"
            preserveAspectRatio="none"
            role="img"
            aria-label="Transaction amount trend"
          >
            <polygon points={spark.area} className="sparkline-area" />
            <polyline points={spark.line} className="sparkline-line" />
            <circle cx={spark.last[0]} cy={spark.last[1]} r="3.5" className="sparkline-dot" />
          </svg>
        </div>
      )}

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
