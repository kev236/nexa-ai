import type { StoryConceptStore } from '../storyConcepts/store.js'
import type { MessagesClient } from '../llm/client.js'
import { generateStoryConcept } from './storyConceptAgent.js'

export type RunStoryConceptGenerationOptions = {
  /** Stops the LLM call if it runs longer than this — readme.md's "Agents" section. */
  timeoutMs?: number
}

export type GenerateStoryConceptResult = {
  id: string
  title: string
}

const DEFAULT_TIMEOUT_MS = 60_000

// Race, not a true cancellation — same caveat as every other agent's
// identical helper in this package (e.g. runCreativeGeneration.ts).
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`story concept generation timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

/**
 * Step 19's one run: generate and store a single story concept for one
 * theme. Never calls requestAction() — see StoryConceptStore's own doc
 * comment for why (no side effect exists yet for a human to approve).
 */
export async function generateStoryConceptOnce(
  storyConceptStore: StoryConceptStore,
  llmClient: MessagesClient,
  businessId: string,
  theme: string,
  format: 'song' | 'story',
  options: RunStoryConceptGenerationOptions = {}
): Promise<GenerateStoryConceptResult> {
  const result = await withTimeout(
    generateStoryConcept(llmClient, theme, format),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  const id = await storyConceptStore.create(businessId, {
    theme,
    format: result.format,
    title: result.title,
    ageRange: result.ageRange,
    script: result.script,
    scenes: result.scenes,
    educationalTakeaway: result.educationalTakeaway,
    safetyNotes: result.safetyNotes,
    reasoning: result.reasoning,
    confidence: result.confidence,
  })

  return { id, title: result.title }
}
