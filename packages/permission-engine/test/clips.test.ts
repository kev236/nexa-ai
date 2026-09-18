import { describe, expect, it } from 'vitest'
import { InMemoryClipStore } from '../src/clips/memoryStore.js'
import { evaluateClip } from '../src/agents/clipDiscoveryAgent.js'
import { discoverClipOnce } from '../src/agents/runClipDiscovery.js'
import type { MessagesClient } from '../src/llm/client.js'

function fakeToolClient(toolName: string, input: unknown): MessagesClient {
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
          content: [{ type: 'tool_use', id: 'toolu_1', name: toolName, input }],
        } as never
      },
    },
  }
}

function evaluationInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Clutch 1v5 comeback',
    viralityScore: 72,
    copyrightRisk: 'high',
    copyrightNotes: 'Verbatim gameplay footage from another streamer, no commentary or transformation added.',
    captions: [
      { platform: 'youtube', caption: 'He should NOT have won this...', hashtags: ['gaming', 'clutch'] },
      { platform: 'instagram', caption: 'No way this was real 😳', hashtags: ['gaming'] },
      { platform: 'tiktok', caption: 'wait for it 👀', hashtags: ['fyp', 'gaming'] },
    ],
    recommendation: 'RESEARCH FURTHER',
    reasoning: 'Strong moment but sourced from a livestream with no visible license.',
    confidence: 0.6,
    ...overrides,
  }
}

describe('evaluateClip — Clip Discovery Agent', () => {
  it('returns the structured evaluation', async () => {
    const client = fakeToolClient('record_clip_evaluation', evaluationInput())
    const result = await evaluateClip(client, 'A streamer clutches a 1v5 in the final round', 'https://twitch.tv/clip/abc')
    expect(result.title).toBe('Clutch 1v5 comeback')
    expect(result.copyrightRisk).toBe('high')
    expect(result.captions).toHaveLength(3)
    expect(result.recommendation).toBe('RESEARCH FURTHER')
  })

  it('rejects a response missing a non-empty captions array — real symptom of a truncated tool call', async () => {
    const client = fakeToolClient('record_clip_evaluation', evaluationInput({ captions: [] }))
    await expect(evaluateClip(client, 'a clip', undefined)).rejects.toThrow(/missing a non-empty "captions" array/)
  })

  it('rejects a caption with an invalid platform', async () => {
    const client = fakeToolClient(
      'record_clip_evaluation',
      evaluationInput({ captions: [{ platform: 'facebook', caption: 'x', hashtags: [] }] })
    )
    await expect(evaluateClip(client, 'a clip', undefined)).rejects.toThrow(/invalid platform/)
  })

  it('rejects an invalid copyrightRisk value', async () => {
    const client = fakeToolClient('record_clip_evaluation', evaluationInput({ copyrightRisk: 'none' }))
    await expect(evaluateClip(client, 'a clip', undefined)).rejects.toThrow(/invalid copyrightRisk/)
  })
})

describe('InMemoryClipStore', () => {
  it('creates and retrieves a clip evaluation', async () => {
    const store = new InMemoryClipStore()
    const id = await store.create('biz_1', {
      sourceUrl: 'https://example.com/clip',
      sourceDescription: 'a clip',
      ...evaluationInput(),
    } as never)
    const record = await store.get(id)
    expect(record?.title).toBe('Clutch 1v5 comeback')
    expect(record?.copyrightRisk).toBe('high')
  })

  it('scopes clips per business and orders newest first', async () => {
    const store = new InMemoryClipStore()
    await store.create('biz_1', { sourceDescription: 'first', ...evaluationInput({ title: 'First' }) } as never)
    await store.create('biz_1', { sourceDescription: 'second', ...evaluationInput({ title: 'Second' }) } as never)
    await store.create('biz_2', { sourceDescription: 'other', ...evaluationInput({ title: 'Other business' }) } as never)

    const list = await store.listByBusiness('biz_1')
    expect(list.map((c) => c.title)).toEqual(['Second', 'First'])
  })

  it('markPosted records the YouTube video id and a posted timestamp', async () => {
    const store = new InMemoryClipStore()
    const id = await store.create('biz_1', { sourceDescription: 'a clip', ...evaluationInput() } as never)
    expect((await store.get(id))?.youtubeVideoId).toBeUndefined()

    await store.markPosted(id, 'yt_abc123')

    const record = await store.get(id)
    expect(record?.youtubeVideoId).toBe('yt_abc123')
    expect(record?.youtubePostedAt).toBeDefined()
  })

  it('markPosted throws for an unknown clip id', async () => {
    const store = new InMemoryClipStore()
    await expect(store.markPosted('nope', 'yt_x')).rejects.toThrow(/no such clip/)
  })
})

describe('discoverClipOnce', () => {
  it('evaluates and stores a clip for a real business', async () => {
    const clipStore = new InMemoryClipStore()
    const client = fakeToolClient('record_clip_evaluation', evaluationInput())

    const { id, title, recommendation } = await discoverClipOnce(clipStore, client, 'biz_1', 'a clip description', 'https://x.test/1')
    expect(title).toBe('Clutch 1v5 comeback')
    expect(recommendation).toBe('RESEARCH FURTHER')

    const record = await clipStore.get(id)
    expect(record?.businessId).toBe('biz_1')
    expect(record?.sourceUrl).toBe('https://x.test/1')
  })
})
