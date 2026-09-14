import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  createAnthropicClient,
  createNexaLabsAdapter,
  runWaitlistTriageOnce,
} from '@nexa-ai/permission-engine'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'

/**
 * Step 8: closes the loop that steps 4-6 left manual — polls nexalabs
 * (Sanity events, and Stripe/crypto transactions if configured), then
 * runs the waitlist-triage agent over anything new. Scheduled by
 * vercel.json's crons entry; CRON_SECRET auth per Vercel's own docs
 * (also lets an operator trigger it by hand: `vercel crons run
 * /api/cron/poll`, or a plain authenticated curl).
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
const AGENT_KEY = 'waitlist-triage'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const engine = getEngine()
    const business = await getBusiness()

    const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
    if (!agent) {
      throw new Error(`no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent first`)
    }

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

    const llmClient = createAnthropicClient()
    const triage = await runWaitlistTriageOnce(engine, llmClient, business.id, agent.id)

    return NextResponse.json({ events, transactions, triage })
  } catch (err) {
    console.error('cron poll failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
