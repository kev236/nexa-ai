import type { ClipStore } from '../clips/store.js'
import type { MessagesClient } from '../llm/client.js'
import { evaluateClip } from './clipDiscoveryAgent.js'

export type RunClipDiscoveryOptions = {
  /** Stops the LLM call if it runs longer than this — readme.md's "Agents" section. */
  timeoutMs?: number
}

export type DiscoverClipResult = {
  id: string
  title: string
  recommendation: string
}

const DEFAULT_TIMEOUT_MS = 60_000

// Race, not a true cancellation — same caveat as every other agent's
// identical helper in this package (e.g. runStoryConceptGeneration.ts).
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`clip discovery timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

/**
 * Step 23's one run: evaluate and store a single clip for one business.
 * Never calls requestAction() — see ClipStore's own doc comment for why
 * (no side effect exists yet for a human to approve).
 */
export async function discoverClipOnce(
  clipStore: ClipStore,
  llmClient: MessagesClient,
  businessId: string,
  sourceDescription: string,
  sourceUrl?: string,
  options: RunClipDiscoveryOptions = {}
): Promise<DiscoverClipResult> {
  const result = await withTimeout(
    evaluateClip(llmClient, sourceDescription, sourceUrl),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  const id = await clipStore.create(businessId, {
    sourceUrl,
    sourceDescription,
    title: result.title,
    viralityScore: result.viralityScore,
    copyrightRisk: result.copyrightRisk,
    copyrightNotes: result.copyrightNotes,
    recommendation: result.recommendation,
    captions: result.captions,
    reasoning: result.reasoning,
    confidence: result.confidence,
  })

  return { id, title: result.title, recommendation: result.recommendation }
}
