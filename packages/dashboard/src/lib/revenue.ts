import 'server-only'
import type { TransactionRecord } from '@nexa-ai/permission-engine'

export type RevenueOverview = {
  /** Oldest-to-newest daily EUR totals, in cents, for the last 7 UTC calendar days. */
  dailyCents: number[]
  totalCents: number
  todayCents: number
  /** undefined when yesterday had nothing to compare against (division by zero, or no data at all). */
  deltaPct: number | undefined
}

const DAYS = 7

/**
 * Real revenue only, EUR only — the two real money integrations (Stripe
 * via NexaLabsAdapter, and Shopify orders via ShopifyAdapter) don't
 * share a currency with the crypto wallet side (USDC), and summing
 * different currencies as one number would just be wrong, not
 * approximately right. A non-EUR charge is real money too, it's just
 * not counted in this EUR-labeled total rather than silently mixed in.
 */
export function summarizeRevenue(transactions: TransactionRecord[]): RevenueOverview {
  const eurCharges = transactions.filter((t) => t.type === 'charge' && t.currency.toLowerCase() === 'eur')

  const now = new Date()
  const dayKeys: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
    dayKeys.push(d.toISOString().slice(0, 10))
  }

  const byDay = new Map(dayKeys.map((k) => [k, 0]))
  for (const t of eurCharges) {
    const key = t.createdAt.slice(0, 10)
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + t.amountCents)
  }

  const dailyCents = dayKeys.map((k) => byDay.get(k) ?? 0)
  const totalCents = eurCharges.reduce((sum, t) => sum + t.amountCents, 0)
  const todayCents = dailyCents[dailyCents.length - 1] ?? 0
  const yesterdayCents = dailyCents[dailyCents.length - 2] ?? 0
  const deltaPct = yesterdayCents > 0 ? ((todayCents - yesterdayCents) / yesterdayCents) * 100 : undefined

  return { dailyCents, totalCents, todayCents, deltaPct }
}
