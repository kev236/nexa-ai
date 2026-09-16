import { describe, expect, it } from 'vitest'
import { generateStoryConcept } from '../src/agents/storyConceptAgent.js'
import { generateStoryConceptOnce } from '../src/agents/runStoryConceptGeneration.js'
import { InMemoryStoryConceptStore } from '../src/storyConcepts/memoryStore.js'
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

function oneScene(overrides: Record<string, unknown> = {}) {
  return {
    sceneNumber: 1,
    visualDescription: 'A small blue bird counting flowers in a sunny meadow',
    narrationOrLyricLine: 'One little flower, red and small',
    durationSeconds: 4,
    ...overrides,
  }
}

function toolResult(overrides: Record<string, unknown> = {}) {
  return {
    format: 'song',
    title: 'Counting Flowers',
    ageRange: '2-4 years',
    script: 'One little flower, red and small\nTwo little flowers, standing tall',
    scenes: [oneScene(), oneScene({ sceneNumber: 2, narrationOrLyricLine: 'Two little flowers, standing tall' })],
    educationalTakeaway: 'Counting to two',
    safetyNotes: 'No scary content; conflict-free counting song; original characters and lyrics.',
    reasoning: 'A simple counting theme fits a repetitive, singable structure well.',
    confidence: 0.8,
    ...overrides,
  }
}

describe('generateStoryConcept — Story Concept Agent', () => {
  it('returns the structured concept', async () => {
    const client = fakeToolClient('record_story_concept', toolResult())
    const result = await generateStoryConcept(client, 'counting flowers', 'song')
    expect(result.title).toBe('Counting Flowers')
    expect(result.format).toBe('song')
    expect(result.scenes).toHaveLength(2)
    expect(result.educationalTakeaway).toBe('Counting to two')
  })

  it('throws on an invalid format', async () => {
    const client = fakeToolClient('record_story_concept', toolResult({ format: 'movie' }))
    await expect(generateStoryConcept(client, 'x', 'song')).rejects.toThrow(/invalid format/)
  })

  it('throws on a missing/empty scenes array — likely a truncated response', async () => {
    const client = fakeToolClient('record_story_concept', toolResult({ scenes: [] }))
    await expect(generateStoryConcept(client, 'x', 'song')).rejects.toThrow(/scenes/)
  })

  it('throws when a scene is missing a required field', async () => {
    const client = fakeToolClient(
      'record_story_concept',
      toolResult({ scenes: [{ sceneNumber: 1, visualDescription: 'x' }] })
    )
    await expect(generateStoryConcept(client, 'x', 'song')).rejects.toThrow(/scene at index 0/)
  })

  it('throws when safetyNotes or reasoning is missing — likely a truncated response', async () => {
    const client = fakeToolClient('record_story_concept', toolResult({ safetyNotes: undefined }))
    await expect(generateStoryConcept(client, 'x', 'song')).rejects.toThrow(/safetyNotes/)
  })
})

describe('generateStoryConceptOnce', () => {
  it('generates and stores a concept, tagged with the submitted theme', async () => {
    const store = new InMemoryStoryConceptStore()
    const client = fakeToolClient('record_story_concept', toolResult())

    const { id, title } = await generateStoryConceptOnce(store, client, 'biz_1', 'counting flowers', 'song')
    expect(title).toBe('Counting Flowers')

    const record = await store.get(id)
    expect(record?.businessId).toBe('biz_1')
    expect(record?.theme).toBe('counting flowers')
    expect(record?.scenes).toHaveLength(2)

    const list = await store.listByBusiness('biz_1')
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(id)
  })
})
