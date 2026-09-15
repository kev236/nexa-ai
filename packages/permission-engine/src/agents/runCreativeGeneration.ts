import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { generateContentConcepts } from './creativeAgent.js'

export type RunCreativeGenerationOptions = {
  /** Stops the LLM call if it runs longer than this — readme.md's "Agents" section (every run needs a wall-clock timeout). maxActions doesn't apply here: one call always produces exactly one concept batch, there's no loop over a queue to bound. */
  timeoutMs?: number
}

export type GenerateConceptsResult = {
  runId: string
  conceptCount: number
}

const DEFAULT_TIMEOUT_MS = 60_000

// Race, not a true cancellation — the underlying Anthropic API call keeps
// running in the background even after this rejects, since it isn't
// wired to an AbortController. What this actually bounds is how long the
// caller (a dashboard request, a CLI run) waits before getting control
// back, per readme.md's "every agent run needs a wall-clock timeout."
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`creative generation timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

/**
 * The Creative Agent's one run: generate and store a scored concept batch
 * for one campaign. Never calls requestAction() — see ContentConceptStore's
 * doc comment for why (no side effect exists yet for a human to approve).
 */
export async function generateConceptsOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  businessId: string,
  campaignId: string,
  agentId?: string,
  options: RunCreativeGenerationOptions = {}
): Promise<GenerateConceptsResult> {
  const campaign = await engine.campaignStore.get(campaignId)
  if (!campaign) {
    throw new Error(`no campaign with id ${campaignId}`)
  }

  const result = await withTimeout(
    generateContentConcepts(llmClient, campaign),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  const runId = await engine.contentConceptStore.create({
    campaignId,
    businessId,
    agentId,
    concepts: result.concepts,
    reasoning: result.reasoning,
    confidence: result.confidence,
  })

  return { runId, conceptCount: result.concepts.length }
}
