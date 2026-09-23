import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createNexaLabsAdapter, createShopifyAdapter } from '@nexa-ai/permission-engine'
import { getEngine } from '@/lib/engine'
import { getBusiness, getDropshippingBusiness } from '@/lib/business'
import { triggerWaitlistTriage } from '@/lib/triage'
import { triggerTransactionReview } from '@/lib/transactionReview'
import { triggerBlogGeneration } from '@/lib/blogGeneration'

/**
 * Step 8: closes the loop that steps 4-6 left manual — polls nexalabs
 * (Sanity events, and Stripe/crypto transactions if configured), then
 * runs the waitlist-triage agent over anything new. Scheduled by
 * vercel.json's crons entry; CRON_SECRET auth per Vercel's own docs
 * (also lets an operator trigger it by hand: `vercel crons run
 * /api/cron/poll`, or a plain authenticated curl).
 *
 * Step 9 added a push counterpart for events specifically
 * (.../api/webhooks/sanity) — this route still matters for Stripe/
 * crypto transactions (no webhook path for those yet) and as a daily
 * backstop in case a webhook delivery is ever missed.
 *
 * Step 12 added reapAbandonedRequests() here too — this daily run is
 * the only place a crashed request ever gets discovered and marked, so
 * it belongs alongside the other "things that happen once a day".
 *
 * Step 14 added the transaction-review agent, run over anything
 * ingestTransactions() just inserted — same "cron is the only trigger,
 * no webhook path for this yet" shape as transactions themselves.
 *
 * readme.md's "Fail closed" invariant: a real failure (missing
 * business/agent row, a broken adapter, a database error) returns 500
 * and reports why — it never returns 200 having silently done nothing
 * or done less than it should have. The one deliberate non-failure is
 * "no payment source configured" from ingestTransactions() — that's an
 * expected state (Stripe/crypto are both optional), not a fail-closed
 * case, so it's caught and reported as skipped rather than failing the
 * whole run.
 *
 * Step 26 added dropshipping's real Shopify orders here, same
 * optional/best-effort shape as nexa-labs' Stripe/crypto transactions
 * above — the dropshipping business row and/or SHOPIFY_SHOP_DOMAIN/
 * SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET not existing in a given
 * environment is an expected state, not a failure of this run.
 *
 * Step 33 added the Blog Agent — same "missing agent/config is an
 * expected state, not a failure of this run" shape as waitlist triage
 * above, caught rather than propagated so one unconfigured piece never
 * takes the whole poll down. Most runs skip via runBlogGenerationOnce's
 * own cadence check (roughly one post per 5 days), not via an error.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const engine = getEngine()
    const business = await getBusiness()
    const adapter = createNexaLabsAdapter()

    const events = await engine.ingestEvents(adapter, business.id, 'poll')

    let transactions: Awaited<ReturnType<typeof engine.ingestTransactions>> | { skipped: string }
    try {
      transactions = await engine.ingestTransactions(adapter, business.id)
    } catch (err) {
      // Stripe and the crypto wallet are both optional — "nothing configured"
      // isn't a failure of this run, so it doesn't trip fail-closed.
      transactions = { skipped: err instanceof Error ? err.message : String(err) }
    }

    const triage = await triggerWaitlistTriage(engine, business)
    const transactionReview = await triggerTransactionReview(engine, business)

    let dropshippingTransactions: Awaited<ReturnType<typeof engine.ingestTransactions>> | { skipped: string }
    try {
      const dropshippingBusiness = await getDropshippingBusiness()
      dropshippingTransactions = await engine.ingestTransactions(createShopifyAdapter(), dropshippingBusiness.id)
    } catch (err) {
      dropshippingTransactions = { skipped: err instanceof Error ? err.message : String(err) }
    }

    // Step 12: a stale, orphaned 'requested' row is exactly what a killed
    // process leaves behind — see engine.ts's reapAbandonedRequests(). A
    // daily sweep here is the only place this ever runs; nothing inside
    // requestAction() itself could detect its own crash.
    const abandoned = await engine.reapAbandonedRequests()

    let blogGeneration: Awaited<ReturnType<typeof triggerBlogGeneration>> | { skipped: string }
    try {
      blogGeneration = await triggerBlogGeneration(engine, business)
    } catch (err) {
      blogGeneration = { skipped: err instanceof Error ? err.message : String(err) }
    }

    return NextResponse.json({
      events,
      transactions,
      triage,
      transactionReview,
      dropshippingTransactions,
      abandoned,
      blogGeneration,
    })
  } catch (err) {
    console.error('cron poll failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
