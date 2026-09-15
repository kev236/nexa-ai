import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import type { TransactionRecord } from '../transactions/store.js'

// Same lazy-resolution reasoning as waitlistTriageAgent.ts's promptPath():
// resolved inside the function, not at module load, so a bundler
// rewriting import.meta.url can't break every consumer of this package
// on import, only a call that actually reaches this function. Also
// avoids `new URL(relative, import.meta.url)` itself now — see that
// same comment for the confirmed bundler bug that shape triggers.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/transaction-review.md')
}

const REVIEW_TOOL = {
  name: 'record_transaction_review',
  description: 'Record the review decision for this transaction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string', description: 'Why this decision was made, for the human reviewer' },
      worthFlagging: { type: 'boolean', description: 'Whether this transaction is worth an owner alert' },
      draftAlert: { type: 'string', description: 'A ready-to-send internal alert to the owner — empty when not flagging' },
      confidence: { type: 'number', description: 'How sure this worthFlagging decision is, 0 to 1' },
    },
    required: ['reasoning', 'worthFlagging', 'confidence'],
    additionalProperties: false,
  },
}

export type TransactionReviewResult = {
  reasoning: string
  worthFlagging: boolean
  draftAlert?: string
  confidence: number
}

/**
 * Step 14's second agent: reads one observed transaction (Stripe or the
 * watched crypto wallet, step 7) and decides whether it's routine or
 * worth a proactive owner alert. Never sends anything itself — same
 * default-autonomy-level-1 shape as waitlistTriageAgent.ts, just
 * reviewing money movement instead of drafting customer replies.
 */
export async function reviewTransaction(
  client: MessagesClient,
  transaction: Pick<TransactionRecord, 'type' | 'amountCents' | 'currency' | 'status'>
): Promise<TransactionReviewResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({
    type: transaction.type,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    status: transaction.status,
  })
  return completeWithTool<TransactionReviewResult>(client, systemPrompt, userContent, REVIEW_TOOL)
}
