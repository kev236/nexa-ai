import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { InMemoryAgentStore } from '../src/agents/memoryStore.js'
import { runBlogGenerationOnce, type SanityReadClient } from '../src/agents/runBlogGeneration.js'
import { registerExecutor } from '../src/executors/registry.js'
import type { MessagesClient } from '../src/llm/client.js'

function fakeLlmClient(input: Record<string, unknown>): MessagesClient {
  return {
    messages: {
      async create() {
        return {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_blog_post', input }],
        } as never
      },
    },
  }
}

function fakeAgentStore(): InMemoryAgentStore {
  return new InMemoryAgentStore(
    new Map([
      [
        'agent_1',
        { id: 'agent_1', businessId: 'biz_1', key: 'blog-writer', role: 'blog', config: {}, active: true, createdAt: '2026-01-01T00:00:00Z' },
      ],
    ])
  )
}

const VALID_TOOL_INPUT = {
  topicChosen: 'Batch evaluation',
  title: 'How To Batch-Evaluate A Week Of Clips',
  excerpt: 'A short summary.',
  paragraphs: [{ style: 'normal', text: 'Body text.' }],
  reasoning: 'This topic was not covered yet.',
  confidence: 0.85,
}

function fakeSanityReadClient(posts: { title: string; publishedAt?: string }[]): SanityReadClient {
  return {
    async fetch() {
      return posts as never
    },
  }
}

describe('runBlogGenerationOnce', () => {
  it('drafts and submits a create_blog_post_draft action when no recent post exists', async () => {
    registerExecutor('create_blog_post_draft', async (payload) => payload)
    const engine = createPermissionEngine({ agentStore: fakeAgentStore() })

    const result = await runBlogGenerationOnce(
      engine,
      fakeLlmClient(VALID_TOOL_INPUT),
      fakeSanityReadClient([]),
      'biz_1',
      'agent_1'
    )

    expect(result).toEqual({ status: 'drafted', title: VALID_TOOL_INPUT.title, topicChosen: VALID_TOOL_INPUT.topicChosen })

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(0) // auto-executed — no expectedCost, active agent
  })

  it('skips when the most recent post is younger than the minimum age', async () => {
    const engine = createPermissionEngine({ agentStore: fakeAgentStore() })
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago

    const result = await runBlogGenerationOnce(
      engine,
      fakeLlmClient(VALID_TOOL_INPUT),
      fakeSanityReadClient([{ title: 'Recent Post', publishedAt: recent }]),
      'biz_1',
      'agent_1',
      { minDaysSinceLastPost: 5 }
    )

    expect(result.status).toBe('skipped')
  })

  it('drafts when the most recent post is older than the minimum age', async () => {
    registerExecutor('create_blog_post_draft', async (payload) => payload)
    const engine = createPermissionEngine({ agentStore: fakeAgentStore() })
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago

    const result = await runBlogGenerationOnce(
      engine,
      fakeLlmClient(VALID_TOOL_INPUT),
      fakeSanityReadClient([{ title: 'Old Post', publishedAt: old }]),
      'biz_1',
      'agent_1',
      { minDaysSinceLastPost: 5 }
    )

    expect(result.status).toBe('drafted')
  })
})
