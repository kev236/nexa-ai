import { createClient } from '@sanity/client'
import type { PermissionEngine } from '../engine.js'
import type { MessagesClient } from '../llm/client.js'
import { generateBlogPost } from './blogAgent.js'

/** Only what this needs — keeps it unit-testable without a real Sanity client, same shape as NexaLabsAdapter's SanityFetchClient. */
export type SanityReadClient = {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
}

/**
 * Constructs the read-only Sanity client runBlogGenerationOnce() needs
 * to check existing post titles/dates. Lives here, not in the dashboard,
 * per this repo's own import-boundary rule (invariant #1): @sanity/client
 * is a credential-holding module, only ever importable from within this
 * package. Same env vars as NexaLabsAdapter's own Sanity client
 * (SANITY_PROJECT_ID/SANITY_DATASET/SANITY_READ_TOKEN) — this is a
 * second, independent read client rather than sharing the adapter's,
 * since the two have no other reason to be coupled.
 */
export function createSanityReadClient(): SanityReadClient {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET
  if (!projectId || !dataset) {
    throw new Error('SANITY_PROJECT_ID and SANITY_DATASET must be set for blog generation to read existing posts.')
  }
  return createClient({
    projectId,
    dataset,
    token: process.env.SANITY_READ_TOKEN,
    apiVersion: '2024-01-01',
    useCdn: false,
  })
}

export type RunBlogGenerationOptions = {
  /** Skip if the most recent post (by publishedAt) is younger than this — keeps the cadence to roughly one post per window instead of one per cron run. Default 5 days. */
  minDaysSinceLastPost?: number
  timeoutMs?: number
}

export type RunBlogGenerationResult =
  | { status: 'skipped'; reason: string }
  | { status: 'drafted'; title: string; topicChosen: string }

const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_MIN_DAYS_SINCE_LAST_POST = 5
const DAY_MS = 24 * 60 * 60 * 1000

// Kept short and rotating rather than trying to be exhaustive — the
// Blog Agent picks whichever of these isn't already a close match for an
// existing title, so this list can grow over time without needing the
// agent's own prompt to change.
const CANDIDATE_TOPICS = [
  'How to batch-evaluate a week of candidate clips in one sitting instead of one at a time',
  'The difference between a clip that needs commentary and one that stands on its own',
  'Why a caption that works on TikTok often fails on YouTube Shorts, and what to do about it',
  'Building a running log of skipped clips and what it teaches you about your own source material',
  'What "confidence score" actually means when a tool gives you one, and how to use it instead of trusting it blindly',
  'The real cost difference between editing everything and editing after a five-minute filter',
]

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`blog generation timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

type RecentPost = { title: string; publishedAt?: string }

/**
 * The Blog Agent's one run: checks cadence, drafts one post if it's due,
 * and submits it as a 'create_blog_post_draft' action. Auto-executes the
 * moment it's requested (step 18's policy — no expectedCost on this
 * request), same as waitlist-triage's replies; unlike those, the effect
 * here is a Sanity *draft*, not something a customer ever sees, which is
 * exactly why that's the safe line to auto-execute up to — see
 * createBlogPostDraft.ts's own comment.
 */
export async function runBlogGenerationOnce(
  engine: PermissionEngine,
  llmClient: MessagesClient,
  sanityReadClient: SanityReadClient,
  businessId: string,
  agentId: string,
  options: RunBlogGenerationOptions = {}
): Promise<RunBlogGenerationResult> {
  const minDays = options.minDaysSinceLastPost ?? DEFAULT_MIN_DAYS_SINCE_LAST_POST

  const recentPosts = await sanityReadClient.fetch<RecentPost[]>(
    `*[_type == "post"] | order(publishedAt desc)[0...20]{title, publishedAt}`
  )

  const mostRecent = recentPosts.find((p) => p.publishedAt)?.publishedAt
  if (mostRecent) {
    const ageMs = Date.now() - new Date(mostRecent).getTime()
    if (ageMs < minDays * DAY_MS) {
      return { status: 'skipped', reason: `most recent post is ${Math.floor(ageMs / DAY_MS)} day(s) old, minimum is ${minDays}` }
    }
  }

  const existingTitles = recentPosts.map((p) => p.title)

  const draft = await withTimeout(
    generateBlogPost(llmClient, CANDIDATE_TOPICS, existingTitles),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  await engine.requestAction({
    businessId,
    agentId,
    actionType: 'create_blog_post_draft',
    payload: { title: draft.title, slug: draft.slug, excerpt: draft.excerpt, paragraphs: draft.paragraphs },
    reasoning: draft.reasoning,
    expectedResult: { title: draft.title, slug: draft.slug },
    confidence: draft.confidence,
  })

  return { status: 'drafted', title: draft.title, topicChosen: draft.topicChosen }
}
