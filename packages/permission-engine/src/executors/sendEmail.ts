import { Resend } from 'resend'
import type { JsonValue } from '../json.js'
import type { BusinessStore } from '../businesses/store.js'
import { createPostgresBusinessStore } from '../businesses/postgresStore.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

/** Only what this executor calls — keeps it unit-testable without a real Resend client. */
export type ResendClient = {
  emails: {
    send(payload: {
      from: string
      to: string
      subject: string
      text: string
    }): Promise<{ data: { id: string } | null; error: { message: string } | null }>
  }
}

type SendEmailPayload = { to: string; subject: string; body: string }

function assertSendEmailPayload(payload: JsonValue): SendEmailPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload.to !== 'string' ||
    typeof payload.subject !== 'string' ||
    typeof payload.body !== 'string'
  ) {
    throw new TypeError('send_email payload must be { to, subject, body }, all strings')
  }
  return payload as SendEmailPayload
}

/**
 * Step 6: the first real execute capability. Approving a send_email
 * decision sends an actual email — a genuine behavior change from step
 * 5's 'noop', where approving only recorded a draft. Scoped to exactly
 * one thing (send this drafted email) per the plan doc's build order;
 * still gated behind requestAction/resolveApproval like everything else.
 * The "from" address is per-business config (businesses.config.emailFrom),
 * never hardcoded here, so this executor stays business-agnostic.
 */
export function createSendEmailExecutor(
  resend: ResendClient,
  businessStore: BusinessStore
): ExecutorFn {
  return async (payload, context) => {
    const { to, subject, body } = assertSendEmailPayload(payload)

    const config = await businessStore.getConfig(context.businessId)
    const from =
      typeof config === 'object' && config !== null && !Array.isArray(config) && typeof config.emailFrom === 'string'
        ? config.emailFrom
        : undefined
    if (!from) {
      throw new Error(
        `business ${context.businessId} has no config.emailFrom set — run db:set-business-config first`
      )
    }

    const result = await resend.emails.send({ from, to, subject, text: body })
    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`)
    }
    return { id: result.data?.id ?? null, to, subject }
  }
}

/**
 * Wires the real Resend client and the real Postgres-backed BusinessStore
 * and registers 'send_email'. Unlike noop.ts, NOT run on import — this
 * needs RESEND_API_KEY and a real database to construct, so each consumer
 * that wants send_email to actually execute calls this once at process
 * start (db/runWaitlistTriage.mjs, packages/dashboard's engine singleton).
 * The executor registry is per-process and in-memory, so every such
 * consumer must call this itself.
 */
export function registerSendEmailExecutor(businessStore?: BusinessStore): void {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.')
  const resend = new Resend(apiKey)
  const store = businessStore ?? createPostgresBusinessStore()
  registerExecutor('send_email', createSendEmailExecutor(resend, store))
}
