import { randomUUID } from 'node:crypto'
import { createClient } from '@sanity/client'
import type { JsonValue } from '../json.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

/** Only what this executor needs — keeps it unit-testable without a real Sanity client. */
export type SanityWriteClient = {
  create(doc: Record<string, unknown>): Promise<{ _id: string }>
}

type ParagraphBlock = { style: 'normal' | 'h2'; text: string }
type CreateBlogPostDraftPayload = {
  title: string
  slug: string
  excerpt: string
  paragraphs: ParagraphBlock[]
}

function assertPayload(payload: JsonValue): CreateBlogPostDraftPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof payload.title !== 'string' ||
    typeof payload.slug !== 'string' ||
    typeof payload.excerpt !== 'string' ||
    !Array.isArray(payload.paragraphs)
  ) {
    throw new TypeError('create_blog_post_draft payload must be { title, slug, excerpt, paragraphs }')
  }
  for (const block of payload.paragraphs) {
    if (
      typeof block !== 'object' ||
      block === null ||
      Array.isArray(block) ||
      (block.style !== 'normal' && block.style !== 'h2') ||
      typeof block.text !== 'string'
    ) {
      throw new TypeError('each paragraphs[] item must be { style: "normal" | "h2", text: string }')
    }
  }
  return payload as unknown as CreateBlogPostDraftPayload
}

function toPortableText(paragraphs: ParagraphBlock[]) {
  return paragraphs.map((p) => ({
    _type: 'block',
    _key: randomUUID(),
    style: p.style,
    markDefs: [],
    children: [{ _type: 'span', _key: randomUUID(), text: p.text, marks: [] }],
  }))
}

/**
 * The Blog Agent's one side effect: creates a *draft* `post` document in
 * nexalabs.tech's Sanity dataset. Deliberately stops there — never calls
 * publish. A Sanity draft isn't public (same reasoning campaigns.ts's own
 * comment gives for content_concepts skipping requestAction() entirely:
 * not customer-facing, not irreversible), so this can safely auto-execute
 * under step 18's "auto-approve everything except money" policy. Actually
 * putting unreviewed, unattended AI writing on the live public site is a
 * different, much worse thing than drafting it — that one step stays a
 * human's call, same as every other "make this public" action in this
 * codebase (approving a post, publishing a campaign's concepts, etc.).
 */
export function createCreateBlogPostDraftExecutor(client: SanityWriteClient): ExecutorFn {
  return async (payload) => {
    const { title, slug, excerpt, paragraphs } = assertPayload(payload)

    const doc = await client.create({
      _id: `drafts.${randomUUID()}`,
      _type: 'post',
      title,
      slug: { _type: 'slug', current: slug },
      excerpt,
      publishedAt: new Date().toISOString(),
      body: toPortableText(paragraphs),
    })

    return { id: doc._id, title, slug }
  }
}

/**
 * Wires a real write-capable Sanity client and registers
 * 'create_blog_post_draft'. Needs its own token — SANITY_WRITE_TOKEN,
 * deliberately separate from NexaLabsAdapter's SANITY_READ_TOKEN
 * (least privilege: the adapter that reads leads has no reason to hold
 * write access, and this executor has no reason to hold read access
 * beyond what runBlogGeneration.ts's own read client uses).
 */
export function registerCreateBlogPostDraftExecutor(): void {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET
  const token = process.env.SANITY_WRITE_TOKEN
  if (!projectId || !dataset || !token) {
    throw new Error('SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN must all be set.')
  }
  const client = createClient({ projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false })
  registerExecutor('create_blog_post_draft', createCreateBlogPostDraftExecutor(client))
}
