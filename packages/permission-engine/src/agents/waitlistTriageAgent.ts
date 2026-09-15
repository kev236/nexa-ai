import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import type { EventRecord } from '../events/store.js'

// Agent prompts are versioned files, not string literals in application
// code — this project's own convention. Resolved lazily, inside the
// function, not at module load, so a top-level failure here can't crash
// any consumer that merely imports the package.
//
// Also deliberately NOT `new URL('../../prompts/...', import.meta.url)`
// — confirmed live (a real dashboard server action, not a CLI script or
// a test) that Next/Turbopack rewrites exactly that two-argument shape
// for static asset resolution, and the rewritten value fails
// fileURLToPath() with "must be of type string or an instance of URL.
// Received an instance of URL." Converting import.meta.url to a string
// first, then joining paths plainly, sidesteps the rewrite entirely —
// this was previously only worked around by staying lazy, which hid the
// bug from module-load time but not from an actual call.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/waitlist-triage.md')
}

const TRIAGE_TOOL = {
  name: 'record_triage',
  description: 'Record the triage decision for this lead.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string', description: 'Why this decision was made, for the human reviewer' },
      draftReply: { type: 'string', description: 'A ready-to-send reply to the lead' },
      confidence: { type: 'number', description: 'How send-ready this draft is, 0 to 1' },
    },
    required: ['reasoning', 'draftReply', 'confidence'],
    additionalProperties: false,
  },
}

export type TriageResult = { reasoning: string; draftReply: string; confidence: number }

/**
 * Step 5's one agent: reads an observed waitlist_signup or contact_message
 * event and drafts a reply. Never sends anything — the caller is expected
 * to route the result through requestAction() so a human approves it, per
 * default autonomy level 1. See docs/plan-001-foundations.md build order.
 */
export async function triageEvent(
  client: MessagesClient,
  event: Pick<EventRecord, 'type' | 'payload'>
): Promise<TriageResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({ eventType: event.type, payload: event.payload })
  return completeWithTool<TriageResult>(client, systemPrompt, userContent, TRIAGE_TOOL)
}
