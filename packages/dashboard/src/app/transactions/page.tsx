import { Wallet, Receipt } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness, getDropshippingBusiness } from '@/lib/business'
import { formatAmount, relativeTime } from '@/lib/format'
import { sparklinePath } from '@/lib/sparkline'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import type { BusinessRecord, TransactionRecord } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

const SPARK_WIDTH = 640
const SPARK_HEIGHT = 72

async function loadSection(loader: () => Promise<BusinessRecord>) {
  try {
    const business = await loader()
    const engine = getEngine()
    const transactions = await engine.transactionStore.listByBusiness(business.id, 100)
    return { business, recent: [...transactions].reverse() }
  } catch {
    return undefined
  }
}

export default async function TransactionsPage() {
  await verifySession()

  const [nexaLabs, dropshipping] = await Promise.all([
    loadSection(() => getBusiness()),
    loadSection(getDropshippingBusiness),
  ])

  return (
    <>
      <Nav active="money" />
      <div className="page-header">
        <h1>Money</h1>
        <p className="subtitle">
          Observability only — nothing here creates a charge, refund, or payout. nexa-labs: Stripe
          charges/refunds/payouts and incoming/outgoing USDC transfers from a watched wallet. Dropshipping:
          Shopify orders.
        </p>
      </div>

      {!nexaLabs && !dropshipping ? (
        <EmptyState
          icon={Wallet}
          title="No transaction-tracked businesses set up yet"
          hint={
            <>
              run <code className="mono">db:seed</code> and/or <code className="mono">db:register-business dropshipping</code> first
            </>
          }
        />
      ) : (
        <>
          {nexaLabs && (
            <TransactionsSection
              title="nexa-labs"
              business={nexaLabs.business}
              recent={nexaLabs.recent}
              delay={0.05}
              emptyHint="set STRIPE_SECRET_KEY and/or ETHERSCAN_API_KEY + WALLET_ADDRESS, then run db:backfill-nexalabs or wait for the next poll"
            />
          )}
          {dropshipping && (
            <TransactionsSection
              title="Dropshipping"
              business={dropshipping.business}
              recent={dropshipping.recent}
              delay={0.15}
              emptyHint="set SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET, then run db:backfill-dropshipping — real once the store has orders"
            />
          )}
        </>
      )}
    </>
  )
}

function TransactionsSection({
  title,
  business,
  recent,
  emptyHint,
  delay = 0,
}: {
  title: string
  business: BusinessRecord
  recent: TransactionRecord[]
  emptyHint: string
  delay?: number
}) {
  // Real amounts, oldest-first, same slice already fetched above — a
  // trend line for what's already on the page, not a new query.
  const spark = sparklinePath(
    recent.map((t) => t.amountCents / 100),
    SPARK_WIDTH,
    SPARK_HEIGHT,
  )

  return (
    <section key={business.id} className="deck-enter" style={{ marginBottom: '2rem', animationDelay: `${delay}s` }}>
      <h2 className="section-title">{title}</h2>

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
        <EmptyState icon={Receipt} title="No transactions observed yet" hint={`${emptyHint}.`} />
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
              <span className="meta">{relativeTime(tx.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
