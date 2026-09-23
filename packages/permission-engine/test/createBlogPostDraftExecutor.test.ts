import { describe, expect, it } from 'vitest'
import { createCreateBlogPostDraftExecutor, type SanityWriteClient } from '../src/executors/createBlogPostDraft.js'

function fakeSanity(overrides: Partial<SanityWriteClient> = {}): SanityWriteClient {
  return {
    create: async (doc) => ({ _id: doc._id as string }),
    ...overrides,
  }
}

describe('create_blog_post_draft executor', () => {
  it('creates a draft (drafts.-prefixed id), never a published document', async () => {
    let captured: Record<string, unknown> | undefined
    const client = fakeSanity({
      create: async (doc) => {
        captured = doc
        return { _id: doc._id as string }
      },
    })
    const executor = createCreateBlogPostDraftExecutor(client)

    const result = await executor(
      {
        title: 'Test Post',
        slug: 'test-post',
        excerpt: 'An excerpt.',
        paragraphs: [
          { style: 'normal', text: 'First paragraph.' },
          { style: 'h2', text: 'A subheading' },
        ],
      },
      { businessId: 'biz_1', agentId: 'agent_1' }
    )

    expect(captured?._type).toBe('post')
    expect(captured?._id).toMatch(/^drafts\./)
    expect(captured?.title).toBe('Test Post')
    expect((captured?.slug as { current: string }).current).toBe('test-post')
    expect(captured?.excerpt).toBe('An excerpt.')

    const body = captured?.body as { style: string; children: { text: string }[] }[]
    expect(body).toHaveLength(2)
    expect(body[0]?.style).toBe('normal')
    expect(body[0]?.children[0]?.text).toBe('First paragraph.')
    expect(body[1]?.style).toBe('h2')

    expect(result).toEqual({ id: captured?._id, title: 'Test Post', slug: 'test-post' })
  })

  it('rejects a payload missing required fields', async () => {
    const executor = createCreateBlogPostDraftExecutor(fakeSanity())
    await expect(
      executor({ title: 'Test' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(TypeError)
  })

  it('rejects a paragraph block with an invalid style', async () => {
    const executor = createCreateBlogPostDraftExecutor(fakeSanity())
    await expect(
      executor(
        { title: 'T', slug: 't', excerpt: 'E', paragraphs: [{ style: 'h1', text: 'x' }] },
        { businessId: 'biz_1', agentId: 'agent_1' }
      )
    ).rejects.toThrow(TypeError)
  })
})
