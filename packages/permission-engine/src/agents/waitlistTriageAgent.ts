import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import type { EventRecord } from '../events/store.js'

// Agent prompts are versioned files, not string literals in application
// code — this project's own convention. Resolved lazily, inside the
// function, not at module load: a bundler (Next/Turbopack, in
// packages/dashboard) rewrites import.meta.url in ways that break this
// resolution, and since this package's index re-exports everything
// eagerly, a top-level failure here would crash any consumer that merely
// imports the package — even one that never calls triageEvent.
function promptPath(): string {
  return fileURLToPath(new URL('../../prompts/waitlist-triage.md', import.meta.url))
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
