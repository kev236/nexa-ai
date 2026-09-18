import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'

// Same lazy-resolution reasoning as every other prompt path in this
// package — see waitlistTriageAgent.ts's promptPath() comment. Also
// avoids `new URL(relative, import.meta.url)` itself now — see
// creativeAgent.ts's identical comment for the confirmed bundler bug
// that shape triggers.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/campaign-normalization.md')
}

const NORMALIZE_TOOL = {
  name: 'record_campaign_normalization',
  description: 'Record the normalized campaign data extracted from the raw input.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      product: { type: 'string', description: 'The product or service being promoted' },
      targetAudience: { type: 'string', description: 'Who the brief says this is for — empty if not stated' },
      problem: { type: 'string', description: 'The customer problem this solves, if stated' },
      benefits: { type: 'array', items: { type: 'string' }, description: 'Benefits explicitly stated in the source text' },
      uniqueSellingPoints: { type: 'array', items: { type: 'string' } },
      allowedClaims: { type: 'array', items: { type: 'string' } },
      forbiddenClaims: { type: 'array', items: { type: 'string' } },
      cta: { type: 'string', description: 'The call to action, if stated' },
      landingPage: { type: 'string', description: 'A URL, only if one literally appears in the source text' },
      availableAssets: { type: 'array', items: { type: 'string' } },
      reasoning: { type: 'string', description: 'For the human reviewer — flag ambiguity and empty fields' },
      confidence: { type: 'number', description: 'How complete/unambiguous the source brief was, 0 to 1' },
    },
    required: ['product', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

export type CampaignNormalizationResult = {
  product: string
  targetAudience?: string
  problem?: string
  benefits: string[]
  uniqueSellingPoints: string[]
  allowedClaims: string[]
  forbiddenClaims: string[]
  cta?: string
  landingPage?: string
  availableAssets: string[]
  reasoning: string
  confidence: number
}

/**
 * Step 16's Campaign Agent: turns raw campaign text (a pasted brief, a
 * CSV row, a manual description) into the normalized shape CampaignStore
 * expects. Never contacts Promote.fun or any other source itself — the
 * raw text is supplied by a human (manual entry or CSV import), matching
 * "never depend on illegal scraping" from the owner's own doc; this
 * agent only does the extraction step.
 */
export async function normalizeCampaign(
  client: MessagesClient,
  rawInput: string
): Promise<CampaignNormalizationResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const result = await completeWithTool<
    Omit<CampaignNormalizationResult, 'benefits' | 'uniqueSellingPoints' | 'allowedClaims' | 'forbiddenClaims' | 'availableAssets'> & {
      benefits?: string[]
      uniqueSellingPoints?: string[]
      allowedClaims?: string[]
      forbiddenClaims?: string[]
      availableAssets?: string[]
    }
  >(client, systemPrompt, rawInput, NORMALIZE_TOOL)

  return {
    ...result,
    benefits: result.benefits ?? [],
    uniqueSellingPoints: result.uniqueSellingPoints ?? [],
    allowedClaims: result.allowedClaims ?? [],
    forbiddenClaims: result.forbiddenClaims ?? [],
    availableAssets: result.availableAssets ?? [],
  }
}
