import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { completeWithTool, type MessagesClient } from '../llm/client.js'

// Same lazy-resolution reasoning as every other prompt path in this
// package — see waitlistTriageAgent.ts's promptPath() comment.
function promptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../prompts/blog-post.md')
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

const BLOG_POST_TOOL = {
  name: 'record_blog_post',
  description: 'Record the generated blog post.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topicChosen: { type: 'string', description: 'Which candidate topic this post is about' },
      title: { type: 'string' },
      excerpt: { type: 'string', description: 'One to two sentence summary, shown in listings' },
      paragraphs: {
        type: 'array',
        description:
          'The post body as a flat sequence of blocks in reading order. Each item is either a plain paragraph or a subheading.',
        items: {
          type: 'object',
          properties: {
            style: { type: 'string', enum: ['normal', 'h2'] },
            text: { type: 'string' },
          },
          required: ['style', 'text'],
          additionalProperties: false,
        },
      },
      reasoning: { type: 'string', description: 'For the human reviewer: why this topic, why this angle' },
      confidence: { type: 'number', description: 'How solid this draft is, 0 to 1' },
    },
    required: ['topicChosen', 'title', 'excerpt', 'paragraphs', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
}

type RawBlogPost = {
  topicChosen: string
  title: string
  excerpt: string
  paragraphs: { style: 'normal' | 'h2'; text: string }[]
  reasoning: string
  confidence: number
}

export type GeneratedBlogPost = {
  title: string
  slug: string
  excerpt: string
  paragraphs: { style: 'normal' | 'h2'; text: string }[]
  topicChosen: string
  reasoning: string
  confidence: number
}

/**
 * Validated the same way creativeAgent.ts validates its tool result —
 * completeWithTool()'s generic is compile-time only, a truncated
 * response can still come back missing fields.
 */
function assertRawBlogPost(value: unknown): asserts value is RawBlogPost {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Blog Agent response was not an object')
  }
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.paragraphs) || result.paragraphs.length === 0) {
    throw new TypeError(
      `Blog Agent response is missing a non-empty "paragraphs" array (got keys: ${Object.keys(result).join(', ')}) — likely a truncated response`
    )
  }
  if (typeof result.title !== 'string' || typeof result.excerpt !== 'string') {
    throw new TypeError('Blog Agent response is missing "title" or "excerpt"')
  }
  if (typeof result.reasoning !== 'string' || typeof result.confidence !== 'number') {
    throw new TypeError('Blog Agent response is missing "reasoning" or "confidence"')
  }
}

/**
 * Writes one blog post draft for nexalabs.tech, picking from a set of
 * candidate topics and avoiding whatever's already been covered. Never
 * publishes anything itself — see createBlogPostDraft.ts's own comment
 * for why the executor only ever creates a Sanity draft, never calls
 * publish.
 */
export async function generateBlogPost(
  client: MessagesClient,
  candidateTopics: string[],
  existingTitles: string[]
): Promise<GeneratedBlogPost> {
  const systemPrompt = readFileSync(promptPath(), 'utf8')
  const userContent = JSON.stringify({ candidateTopics, existingTitles })
  // 8192, not the default 4096 — a real 400-700 word post with several
  // paragraph blocks runs the default into truncation, same reasoning as
  // creativeAgent.ts's identical bump.
  const result = await completeWithTool<RawBlogPost>(client, systemPrompt, userContent, BLOG_POST_TOOL, 8192)
  assertRawBlogPost(result)

  return {
    title: result.title,
    slug: slugify(result.title),
    excerpt: result.excerpt,
    paragraphs: result.paragraphs,
    topicChosen: result.topicChosen,
    reasoning: result.reasoning,
    confidence: result.confidence,
  }
}
