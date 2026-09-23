import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'
import type { StoryScene } from '../storyConcepts/store.js'

// See creativeAgent.ts's identical comment: NOT `new URL('../../prompts/...',
// import.meta.url)` — that two-argument form is what Next/Turbopack
// rewrites in a way fileURLToPath() rejects. Converting import.meta.url
// to a string first and joining paths plainly avoids it.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/story-concept.md')
}

const STORY_CONCEPT_TOOL = {
  name: 'record_story_concept',
  description: "Record the generated children's content concept.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      format: { type: 'string', enum: ['song', 'story'] },
      title: { type: 'string' },
      ageRange: { type: 'string' },
      script: { type: 'string' },
      scenes: {
        type: 'array',
        description: 'Every line of script, broken into scenes for a future visual-generation pass',
        items: {
          type: 'object',
          properties: {
            sceneNumber: { type: 'number' },
            visualDescription: { type: 'string' },
            narrationOrLyricLine: { type: 'string' },
            durationSeconds: { type: 'number' },
          },
          required: ['sceneNumber', 'visualDescription', 'narrationOrLyricLine', 'durationSeconds'],
          additionalProperties: false,
        },
      },
      educationalTakeaway: { type: 'string' },
      safetyNotes: { type: 'string' },
      reasoning: { type: 'string' },
      confidence: { type: 'number', description: 'How well the theme translated into a strong, safe concept, 0 to 1' },
    },
    required: ['format', 'title', 'ageRange', 'script', 'scenes', 'educationalTakeaway', 'safetyNotes', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

type StoryConceptToolResult = {
  format: 'song' | 'story'
  title: string
  ageRange: string
  script: string
  scenes: StoryScene[]
  educationalTakeaway: string
  safetyNotes: string
  reasoning: string
  confidence: number
}

/**
 * "Validate all AI output against schemas before processing it" — same
 * reasoning as every other agent's identical check in this package. A
 * truncated or malformed tool call fails loudly here rather than
 * storing a concept missing scenes, a safety note, or half its script.
 */
function assertStoryConceptToolResult(value: unknown): asserts value is StoryConceptToolResult {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Story Concept Agent response was not an object')
  }
  const result = value as Record<string, unknown>
  if (result.format !== 'song' && result.format !== 'story') {
    throw new TypeError(`Story Concept Agent response has an invalid format: ${JSON.stringify(result.format)}`)
  }
  if (typeof result.title !== 'string' || typeof result.ageRange !== 'string' || typeof result.script !== 'string') {
    throw new TypeError('Story Concept Agent response is missing title, ageRange, or script')
  }
  if (!Array.isArray(result.scenes) || result.scenes.length === 0) {
    throw new TypeError(
      `Story Concept Agent response is missing a non-empty "scenes" array (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  result.scenes.forEach((raw, i) => {
    const s = raw as Record<string, unknown>
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof s.sceneNumber !== 'number' ||
      typeof s.visualDescription !== 'string' ||
      typeof s.narrationOrLyricLine !== 'string' ||
      typeof s.durationSeconds !== 'number'
    ) {
      throw new TypeError(`Story Concept Agent scene at index ${i} is missing a required field`)
    }
  })
  if (
    typeof result.educationalTakeaway !== 'string' ||
    typeof result.safetyNotes !== 'string' ||
    typeof result.reasoning !== 'string' ||
    typeof result.confidence !== 'number'
  ) {
    throw new TypeError(
      `Story Concept Agent response is missing educationalTakeaway, safetyNotes, reasoning, or confidence (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
}

export type StoryConceptGenerationResult = {
  format: 'song' | 'story'
  title: string
  ageRange: string
  script: string
  scenes: StoryScene[]
  educationalTakeaway: string
  safetyNotes: string
  reasoning: string
  confidence: number
}

/**
 * Step 19: Sproutlight's Story Concept Agent — reads one owner-submitted
 * theme and a requested format, and generates a single, complete
 * concept. No video, no audio, no publishing; drafting only, same shape
 * as step 16's Campaign/Creative Agents. The prompt (prompts/story-concept.md)
 * carries the actual child-safety rules — this function only validates
 * the response's shape, it doesn't re-check content safety itself
 * (there is no reliable deterministic check for "is this scary enough
 * to give a toddler nightmares"), so safetyNotes exists specifically to
 * make the model's own safety reasoning visible to the human reviewer
 * who has the final say.
 */
export async function generateStoryConcept(
  client: MessagesClient,
  theme: string,
  format: 'song' | 'story'
): Promise<StoryConceptGenerationResult> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({ theme, format })
  const result = await completeWithTool<StoryConceptToolResult>(client, systemPrompt, userContent, STORY_CONCEPT_TOOL, 4096)
  assertStoryConceptToolResult(result)
  return result
}
