import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import { computeConceptScore, type ContentAngle, type ContentConcept } from '../contentConcepts/types.js'
import type { CampaignRecord } from '../campaigns/store.js'

function promptPath(): string {
  return fileURLToPath(new URL('../../prompts/creative-concepts.md', import.meta.url))
}

const CONCEPT_ANGLES = [
  'educational',
  'curiosity',
  'problem_solution',
  'story',
  'controversial',
  'comparison',
  'demonstration',
  'transformation',
  'listicle',
  'personal_experience',
] as const

const CONCEPTS_TOOL = {
  name: 'record_content_concepts',
  description: 'Record the generated content concepts for this campaign.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      concepts: {
        type: 'array',
        description: 'The generated concepts',
        items: {
          type: 'object',
          properties: {
            angle: { type: 'string', enum: CONCEPT_ANGLES },
            hook: { type: 'string' },
            scriptOutline: { type: 'string' },
            cta: { type: 'string' },
            caption: { type: 'string' },
            visualConcept: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            scores: {
              type: 'object',
              properties: {
                hook: { type: 'number' },
                retention: { type: 'number' },
                shareability: { type: 'number' },
                clarity: { type: 'number' },
                conversion: { type: 'number' },
                offerFit: { type: 'number' },
              },
              required: ['hook', 'retention', 'shareability', 'clarity', 'conversion', 'offerFit'],
              additionalProperties: false,
            },
          },
          required: ['angle', 'hook', 'scriptOutline', 'cta', 'caption', 'visualConcept', 'hashtags', 'scores'],
          additionalProperties: false,
        },
      },
      reasoning: { type: 'string' },
      confidence: { type: 'number', description: 'How well-supported this batch is by the campaign data, 0 to 1' },
    },
    required: ['concepts', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

type RawConcept = {
  angle: ContentAngle
  hook: string
  scriptOutline: string
  cta: string
  caption: string
  visualConcept: string
  hashtags: string[]
  scores: {
    hook: number
    retention: number
    shareability: number
    clarity: number
    conversion: number
    offerFit: number
  }
}

type CreativeToolResult = {
  concepts: RawConcept[]
  reasoning: string
  confidence: number
}

/**
 * "Validate all AI output against schemas before processing it" (the
 * owner's own doc, section 9) — a real, previously-missing check.
 * completeWithTool()'s TypeScript generic gives compile-time shape, not
 * a runtime guarantee: a truncated tool call can come back with some
 * top-level fields simply absent, which `as T` casts right past. Thrown,
 * never silently patched with a default — an incomplete creative batch
 * should fail loudly, not get stored as if it were complete.
 */
function assertCreativeToolResult(value: unknown): asserts value is CreativeToolResult {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Creative Agent response was not an object')
  }
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.concepts) || result.concepts.length === 0) {
    throw new TypeError(
      `Creative Agent response is missing a non-empty "concepts" array (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  if (typeof result.reasoning !== 'string' || typeof result.confidence !== 'number') {
    throw new TypeError(
      `Creative Agent response is missing "reasoning" or "confidence" (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
}

export type CreativeGenerationResult = {
  concepts: ContentConcept[]
  reasoning: string
  confidence: number
}

/** How many of the highest-scoring concepts get recommended: true — the doc's "automatically select the strongest concepts," computed here, not by the model. */
const RECOMMENDED_COUNT = 3

/**
 * Step 16's Creative Agent: reads one normalized campaign and generates
 * a set of scored content concepts. Never contacts a customer, never
 * publishes anything, never spends money — this is drafting only, held
 * for the owner to review in the dashboard. The model reports six
 * sub-scores per concept; the weighted total (and which concepts get
 * marked recommended) is computed deterministically afterward — see
 * computeConceptScore() — never trusted as arithmetic the model did
 * itself.
 */
export async function generateContentConcepts(
  client: MessagesClient,
  campaign: Pick<
    CampaignRecord,
    | 'product'
    | 'targetAudience'
    | 'problem'
    | 'benefits'
    | 'uniqueSellingPoints'
    | 'allowedClaims'
    | 'forbiddenClaims'
    | 'cta'
    | 'landingPage'
  >
): Promise<CreativeGenerationResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify(campaign)
  // 8192, not the default 4096 — six fully-formed concepts (hook,
  // outline, CTA, caption, visual note, hashtags, six scores each) ran
  // this into real truncation at the default during testing.
  const result = await completeWithTool<CreativeToolResult>(client, systemPrompt, userContent, CONCEPTS_TOOL, 8192)
  assertCreativeToolResult(result)

  const scored: ContentConcept[] = result.concepts.map((c) => ({
    angle: c.angle,
    hook: c.hook,
    scriptOutline: c.scriptOutline,
    cta: c.cta,
    caption: c.caption,
    visualConcept: c.visualConcept,
    hashtags: c.hashtags,
    score: {
      ...c.scores,
      total: computeConceptScore(c.scores),
    },
  }))

  // A tie at the cutoff score recommends every concept tied there, so
  // this can mark more than RECOMMENDED_COUNT — deliberately: dropping
  // an arbitrary one of several equally-scored concepts would be a coin
  // flip, not a decision.
  const cutoff = [...scored].map((c) => c.score.total).sort((a, b) => b - a)[RECOMMENDED_COUNT - 1]
  const concepts = scored.map((c) => ({ ...c, recommended: cutoff !== undefined && c.score.total >= cutoff }))

  return { concepts, reasoning: result.reasoning, confidence: result.confidence }
}
