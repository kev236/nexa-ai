import { Resend } from 'resend'
import type { ResendClient } from '../executors/sendEmail.js'
import type { OwnerStore } from '../owners/store.js'
import type { BusinessStore } from '../businesses/store.js'
import { createPostgresOwnerStore } from '../owners/postgresStore.js'
import { createPostgresBusinessStore } from '../businesses/postgresStore.js'
import type { ActionRequest } from '../types.js'
import type { Notifier } from './notifier.js'

/**
 * Emails every owner when requestAction() produces a pending_approval —
 * closing the loop step 9 only closed one direction of: events can now
 * reach an agent fast, but the owner still had to remember to check the
 * dashboard to see what it drafted. One email per pending approval, not
 * a digest — at this system's current volume (single business, a
 * handful of leads a day) a digest would just be a batch of one most of
 * the time, and an immediate, individually-actionable email is more
 * useful than a queued summary. Revisit if volume ever makes that untrue.
 *
 * Deliberately minimal content — per readme.md's "Personal data"
 * section ("send the minimum that will do the job"), this doesn't
 * include the raw payload (which may carry a customer's name/email/
 * message), only the reasoning and enough context to decide whether to
 * go look. Full detail is one dashboard visit away, which is already
 * access-controlled and audited.
 */
async function resolveFromAddress(businessStore: BusinessStore, businessId: string): Promise<string | undefined> {
  const config = await businessStore.getConfig(businessId)
  return typeof config === 'object' && config !== null && !Array.isArray(config) && typeof config.emailFrom === 'string'
    ? config.emailFrom
    : undefined
}

export function createEmailNotifier(
  resend: ResendClient,
  ownerStore: OwnerStore,
  businessStore: BusinessStore
): Notifier {
  async function sendToOwners(businessId: string, subject: string, text: string): Promise<void> {
    const owners = await ownerStore.listAll()
    if (owners.length === 0) return

    const from = await resolveFromAddress(businessStore, businessId)
    if (!from) return // no configured "from" address — nothing to send from, not an error

    const results = await Promise.all(owners.map((owner) => resend.emails.send({ from, to: owner.email, subject, text })))
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      throw new Error(`Resend send failed: ${failed.error.message}`)
    }
  }

  return {
    async notifyPendingApproval(request: ActionRequest, approvalId: string): Promise<void> {
      const dashboardUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'the dashboard'
      const text =
        `Agent ${request.agentId} wants to run "${request.actionType}" and is waiting on your decision.\n\n` +
        `Reasoning: ${request.reasoning}\n\n` +
        `Review and approve or deny: ${dashboardUrl}\n\n` +
        `approval id: ${approvalId}`

      await sendToOwners(request.businessId, `Nexa AI: "${request.actionType}" needs your approval`, text)
    },

    async notify(businessId: string, subject: string, text: string): Promise<void> {
      await sendToOwners(businessId, subject, text)
    },
  }
}

/**
 * Wires the real Resend client and real Postgres-backed stores. Same
 * shape as registerSendEmailExecutor(): throws if RESEND_API_KEY isn't
 * set rather than degrading silently — it's the caller's job (the
 * dashboard engine singleton) to decide notification is optional and
 * catch that, the same way it already does for the executor.
 */
export function createResendEmailNotifier(ownerStore?: OwnerStore, businessStore?: BusinessStore): Notifier {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.')
  const resend: ResendClient = new Resend(apiKey)
  const owners = ownerStore ?? createPostgresOwnerStore()
  const business = businessStore ?? createPostgresBusinessStore()
  return createEmailNotifier(resend, owners, business)
}
