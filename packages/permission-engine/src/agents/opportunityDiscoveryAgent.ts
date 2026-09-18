import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import { SCORE_DIMENSIONS, computeTotalScore, assertOpportunityScores, type OpportunityScores } from '../opportunities/scoring.js'
import type { OpportunityRecord } from '../opportunities/store.js'

// Deliberately not `new URL('../../prompts/...', import.meta.url)` — see
// creativeAgent.ts's identical comment for why: that two-argument form is
// exactly the shape bundlers special-case for static asset resolution,
// and Next.js's server runtime rewrites it into something that isn't a
// real URL instance, breaking fileURLToPath() with a genuinely confusing
// error. Converting import.meta.url to a string first and joining paths
// plainly avoids that rewrite entirely.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/opportunity-discovery.md')
}

// Built from SCORE_DIMENSIONS rather than hardcoded a second time — the
// 12 keys only ever need to be listed once, in scoring.ts.
const scoreProperties = Object.fromEntries(SCORE_DIMENSIONS.map(({ key }) => [key, { type: 'number' }]))
const scoreKeys = SCORE_DIMENSIONS.map(({ key }) => key)

const DISCOVERY_TOOL = {
  name: 'record_opportunity_proposals',
  description: 'Record the proposed business/product opportunities.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      opportunities: {
        type: 'array',
        description: 'The proposed opportunities',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            problem: { type: 'string' },
            targetCustomer: { type: 'string' },
            recommendation: { type: 'string', enum: ['BUILD MVP', 'MONITOR', 'RESEARCH FURTHER', 'PASS'] },
            scores: {
              type: 'object',
              properties: scoreProperties,
              required: scoreKeys,
              additionalProperties: false,
            },
          },
          required: ['name', 'problem', 'targetCustomer', 'recommendation', 'scores'],
          additionalProperties: false,
        },
      },
      reasoning: { type: 'string' },
      confidence: { type: 'number', description: 'How well-grounded this batch is in real reasoning, 0 to 1' },
    },
    required: ['opportunities', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

type RawOpportunity = {
  name: string
  problem: string
  targetCustomer: string
  recommendation: string
  scores: OpportunityScores
}

type DiscoveryToolResult = {
  opportunities: RawOpportunity[]
  reasoning: string
  confidence: number
}

/**
 * "Validate all AI output against schemas before processing it" (the
 * owner's own doc, section 9) — same reasoning as creativeAgent.ts's
 * identical check. completeWithTool()'s generic gives compile-time
 * shape, not a runtime guarantee; a truncated or malformed tool call
 * fails loudly here instead of writing a bad opportunity to the table.
 */
function assertDiscoveryToolResult(value: unknown): asserts value is DiscoveryToolResult {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Opportunity Discovery Agent response was not an object')
  }
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.opportunities) || result.opportunities.length === 0) {
    throw new TypeError(
      `Opportunity Discovery Agent response is missing a non-empty "opportunities" array (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  if (typeof result.reasoning !== 'string' || typeof result.confidence !== 'number') {
    throw new TypeError(
      `Opportunity Discovery Agent response is missing "reasoning" or "confidence" (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  result.opportunities.forEach((raw, i) => {
    const o = raw as Record<string, unknown>
    if (
      typeof o !== 'object' ||
      o === null ||
      typeof o.name !== 'string' ||
      typeof o.problem !== 'string' ||
      typeof o.targetCustomer !== 'string' ||
      typeof o.recommendation !== 'string'
    ) {
      throw new TypeError(`Opportunity Discovery Agent proposal at index ${i} is missing a required text field`)
    }
    assertOpportunityScores(o.scores)
  })
}

export type OpportunityProposal = {
  name: string
  problem: string
  targetCustomer: string
  recommendation: string
  scores: OpportunityScores
  totalScore: number
}

export type OpportunityDiscoveryResult = {
  proposals: OpportunityProposal[]
  reasoning: string
  confidence: number
}

/**
 * Step 17: reads the existing opportunities list (so it doesn't propose
 * a duplicate) and generates up to 3 new, scored opportunity proposals.
 * Never claims real-time trend/market data it doesn't have — see
 * prompts/opportunity-discovery.md; this is reasoned brainstorming, not
 * a live research pipeline. The model reports 12 raw scores per
 * proposal; the total is always computed here (a plain average, same as
 * scoring.ts's computeTotalScore for owner-entered opportunities), never
 * trusted as arithmetic the model did itself.
 */
export async function discoverOpportunities(
  client: MessagesClient,
  existingOpportunities: Pick<OpportunityRecord, 'name' | 'problem'>[]
): Promise<OpportunityDiscoveryResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({ existingOpportunities })
  const result = await completeWithTool<DiscoveryToolResult>(client, systemPrompt, userContent, DISCOVERY_TOOL, 8192)
  assertDiscoveryToolResult(result)

  const proposals: OpportunityProposal[] = result.opportunities.map((o) => ({
    name: o.name,
    problem: o.problem,
    targetCustomer: o.targetCustomer,
    recommendation: o.recommendation,
    scores: o.scores,
    totalScore: computeTotalScore(o.scores),
  }))

  return { proposals, reasoning: result.reasoning, confidence: result.confidence }
}
