import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createNexaLabsAdapter } from '@nexa-ai/permission-engine'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { triggerWaitlistTriage } from '@/lib/triage'

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
 * readme.md's "Fail closed" invariant: a real failure (missing
 * business/agent row, a broken adapter, a database error) returns 500
 * and reports why — it never returns 200 having silently done nothing
 * or done less than it should have. The one deliberate non-failure is
 * "no payment source configured" from ingestTransactions() — that's an
 * expected state (Stripe/crypto are both optional), not a fail-closed
 * case, so it's caught and reported as skipped rather than failing the
 * whole run.
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

    // Step 12: a stale, orphaned 'requested' row is exactly what a killed
    // process leaves behind — see engine.ts's reapAbandonedRequests(). A
    // daily sweep here is the only place this ever runs; nothing inside
    // requestAction() itself could detect its own crash.
    const abandoned = await engine.reapAbandonedRequests()

    return NextResponse.json({ events, transactions, triage, abandoned })
  } catch (err) {
    console.error('cron poll failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
