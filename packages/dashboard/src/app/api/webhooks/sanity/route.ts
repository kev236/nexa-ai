import { NextResponse } from 'next/server'
import { createNexaLabsAdapter, SANITY_WEBHOOK_SIGNATURE_HEADER } from '@nexa-ai/permission-engine'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { triggerWaitlistTriage } from '@/lib/triage'

/**
 * Step 9: the push counterpart to /api/cron/poll for events specifically
 * — reacts to a new waitlist signup or contact message immediately,
 * instead of waiting for the next daily poll. This is the webhook that
 * actually delivers "faster than a poll interval" reactivity; Resend/
 * Stripe webhooks (the ones the original plan doc named) only report
 * the status of email this system already sent, not a new lead — see
 * NexaLabsAdapter.handleSanityWebhook()'s own comment.
 *
 * Configure in the nexalabs Sanity project (sanity.io/manage → your
 * project → API → Webhooks → Create webhook):
 *   URL:        https://<this deployment>/api/webhooks/sanity
 *   Dataset:    same as SANITY_DATASET
 *   Trigger on: Create
 *   Filter:     _type in ["waitlist", "contactMessage"]
 *   Projection: @          (sends the full document — same shape the
 *                            poll path already parses via toObservedEvent)
 *   Secret:     generate one (openssl rand -base64 32) and set it as
 *               both the webhook's secret here AND SANITY_WEBHOOK_SECRET
 *               on this deployment.
 *
 * Authenticated by verifying Sanity's own request signature (via the
 * official @sanity/webhook package — see the adapter method for why a
 * hand-rolled comparison isn't worth the risk here), never a bearer
 * secret like the cron route — this is the correct model for a webhook
 * a third party calls, where only the payload-signing scheme they
 * document is available.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get(SANITY_WEBHOOK_SIGNATURE_HEADER)

  try {
    const adapter = createNexaLabsAdapter()
    const events = await adapter.handleSanityWebhook(rawBody, signature)

    const engine = getEngine()
    const business = await getBusiness()

    let inserted = 0
    for (const event of events) {
      const result = await engine.ingestWebhookEvent(business.id, event)
      if (result.inserted) inserted++
    }

    // Only bother running triage if this delivery actually added
    // something new — a duplicate/retried delivery (Sanity does retry)
    // shouldn't trigger a redundant agent run.
    const triage = inserted > 0 ? await triggerWaitlistTriage(engine, business) : undefined

    return NextResponse.json({ observed: events.length, inserted, triage })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sanity webhook failed:', message)

    let status = 500
    if (/no Sanity webhook secret configured/.test(message)) status = 500
    else if (/missing .*signature header/i.test(message)) status = 400
    else if (/invalid Sanity webhook signature/.test(message)) status = 401
    else if (/unexpected Sanity webhook payload shape/.test(message)) status = 400

    return NextResponse.json({ error: message }, { status })
  }
}
