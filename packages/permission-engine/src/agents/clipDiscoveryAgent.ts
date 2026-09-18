import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import { PLATFORMS } from '../socialAccounts/store.js'
import type { ClipCaption } from '../clips/store.js'

// See creativeAgent.ts's identical comment: NOT `new URL('../../prompts/...',
// import.meta.url)` — that two-argument form is what Next/Turbopack
// rewrites in a way fileURLToPath() rejects. Converting import.meta.url
// to a string first and joining paths plainly avoids it.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/clip-discovery.md')
}

const CLIP_EVALUATION_TOOL = {
  name: 'record_clip_evaluation',
  description: 'Record the scored evaluation of one clip TrendRush is considering reposting.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'A suggested repost title/hook for this clip.' },
      viralityScore: { type: 'number', description: '0-100, how likely this repost is to perform well.' },
      copyrightRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
      copyrightNotes: { type: 'string' },
      captions: {
        type: 'array',
        description: 'Exactly one entry per platform: youtube, instagram, tiktok.',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: [...PLATFORMS] },
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
          },
          required: ['platform', 'caption', 'hashtags'],
          additionalProperties: false,
        },
      },
      recommendation: { type: 'string', enum: ['REPOST', 'RESEARCH FURTHER', 'SKIP'] },
      reasoning: { type: 'string' },
      confidence: { type: 'number', description: 'How much could actually be assessed from the input given, 0 to 1' },
    },
    required: ['title', 'viralityScore', 'copyrightRisk', 'copyrightNotes', 'captions', 'recommendation', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

type ClipEvaluationToolResult = {
  title: string
  viralityScore: number
  copyrightRisk: 'low' | 'medium' | 'high'
  copyrightNotes: string
  captions: ClipCaption[]
  recommendation: string
  reasoning: string
  confidence: number
}

/**
 * "Validate all AI output against schemas before processing it" — same
 * reasoning as every other agent's identical check in this package. A
 * truncated or malformed tool call fails loudly here rather than
 * storing an evaluation missing its risk assessment or platform drafts.
 */
function assertClipEvaluationToolResult(value: unknown): asserts value is ClipEvaluationToolResult {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Clip Discovery Agent response was not an object')
  }
  const result = value as Record<string, unknown>
  if (typeof result.title !== 'string' || typeof result.viralityScore !== 'number') {
    throw new TypeError('Clip Discovery Agent response is missing title or viralityScore')
  }
  if (result.copyrightRisk !== 'low' && result.copyrightRisk !== 'medium' && result.copyrightRisk !== 'high') {
    throw new TypeError(`Clip Discovery Agent response has an invalid copyrightRisk: ${JSON.stringify(result.copyrightRisk)}`)
  }
  if (typeof result.copyrightNotes !== 'string') {
    throw new TypeError('Clip Discovery Agent response is missing copyrightNotes')
  }
  if (!Array.isArray(result.captions) || result.captions.length === 0) {
    throw new TypeError(
      `Clip Discovery Agent response is missing a non-empty "captions" array (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  result.captions.forEach((raw, i) => {
    const c = raw as Record<string, unknown>
    if (
      typeof c !== 'object' ||
      c === null ||
      !PLATFORMS.includes(c.platform as never) ||
      typeof c.caption !== 'string' ||
      !Array.isArray(c.hashtags)
    ) {
      throw new TypeError(`Clip Discovery Agent caption at index ${i} is missing a required field or has an invalid platform`)
    }
  })
  if (typeof result.recommendation !== 'string' || typeof result.reasoning !== 'string' || typeof result.confidence !== 'number') {
    throw new TypeError(
      `Clip Discovery Agent response is missing recommendation, reasoning, or confidence (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
}

export type ClipEvaluationResult = {
  title: string
  viralityScore: number
  copyrightRisk: 'low' | 'medium' | 'high'
  copyrightNotes: string
  captions: ClipCaption[]
  recommendation: string
  reasoning: string
  confidence: number
}

/**
 * Step 23: TrendRush's Clip Discovery Agent — reads one owner-submitted
 * clip (a URL and/or description) and evaluates it: a virality score,
 * a copyright-risk check (the real reason an earlier version of this
 * business was shelved — see prompts/clip-discovery.md), per-platform
 * captions, and a recommendation. This step only drafts the evaluation;
 * posting is a separate step (see executors/postClipYoutube.ts) that
 * only runs once a real video is actually attached.
 */
export async function evaluateClip(
  client: MessagesClient,
  sourceDescription: string,
  sourceUrl?: string
): Promise<ClipEvaluationResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({ sourceDescription, sourceUrl })
  const result = await completeWithTool<ClipEvaluationToolResult>(client, systemPrompt, userContent, CLIP_EVALUATION_TOOL, 2048)
  assertClipEvaluationToolResult(result)
  return result
}
