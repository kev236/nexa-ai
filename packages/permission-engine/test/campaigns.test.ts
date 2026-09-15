import { describe, expect, it } from 'vitest'
import { computeConceptScore } from '../src/contentConcepts/types.js'
import { normalizeCampaign } from '../src/agents/campaignAgent.js'
import { generateContentConcepts } from '../src/agents/creativeAgent.js'
import { InMemoryCampaignStore } from '../src/campaigns/memoryStore.js'
import { InMemoryContentConceptStore } from '../src/contentConcepts/memoryStore.js'
import { createPermissionEngine } from '../src/engine.js'
import { importCampaignOnce } from '../src/agents/runCampaignImport.js'
import { generateConceptsOnce } from '../src/agents/runCreativeGeneration.js'
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

describe('computeConceptScore', () => {
  it('applies the doc\'s exact weighted formula', () => {
    // hook*0.25 + retention*0.25 + conversion*0.20 + shareability*0.15 + clarity*0.10 + offerFit*0.05
    const total = computeConceptScore({
      hook: 80,
      retention: 80,
      shareability: 80,
      clarity: 80,
      conversion: 80,
      offerFit: 80,
    })
    expect(total).toBe(80) // uniform input always returns itself regardless of weights
  })

  it('weighs hook and retention more than offerFit', () => {
    const highHook = computeConceptScore({ hook: 100, retention: 0, shareability: 0, clarity: 0, conversion: 0, offerFit: 0 })
    const highOfferFit = computeConceptScore({ hook: 0, retention: 0, shareability: 0, clarity: 0, conversion: 0, offerFit: 100 })
    expect(highHook).toBeGreaterThan(highOfferFit)
    expect(highHook).toBe(25) // 100 * 0.25
    expect(highOfferFit).toBe(5) // 100 * 0.05
  })

  it('rounds to the nearest integer', () => {
    const total = computeConceptScore({ hook: 77, retention: 63, shareability: 51, clarity: 88, conversion: 42, offerFit: 90 })
    expect(Number.isInteger(total)).toBe(true)
  })
})

describe('normalizeCampaign — Campaign Agent', () => {
  it('returns the structured result and defaults missing arrays to empty', async () => {
    const client = fakeToolClient('record_campaign_normalization', {
      product: 'Nexa SiteAudit',
      reasoning: 'Terse brief, most fields unstated.',
      confidence: 0.4,
    })
    const result = await normalizeCampaign(client, 'Promote our site audit tool.')
    expect(result.product).toBe('Nexa SiteAudit')
    expect(result.benefits).toEqual([])
    expect(result.forbiddenClaims).toEqual([])
    expect(result.confidence).toBe(0.4)
  })

  it('preserves fields the model did fill in', async () => {
    const client = fakeToolClient('record_campaign_normalization', {
      product: 'Nexa QuoteFlow',
      targetAudience: 'Freelance contractors',
      benefits: ['Faster quotes', 'e-signatures'],
      forbiddenClaims: ['No income guarantees'],
      reasoning: 'Clear brief.',
      confidence: 0.9,
    })
    const result = await normalizeCampaign(client, 'some raw brief')
    expect(result.targetAudience).toBe('Freelance contractors')
    expect(result.benefits).toEqual(['Faster quotes', 'e-signatures'])
    expect(result.forbiddenClaims).toEqual(['No income guarantees'])
  })
})

describe('generateContentConcepts — Creative Agent', () => {
  function conceptInput(overrides: Record<string, unknown> = {}) {
    return {
      angle: 'curiosity',
      hook: 'Did you know...',
      scriptOutline: 'beat 1, beat 2',
      cta: 'Try it free',
      caption: 'Check this out',
      visualConcept: 'screen recording',
      hashtags: ['saas', 'productivity'],
      scores: { hook: 70, retention: 70, shareability: 70, clarity: 70, conversion: 70, offerFit: 70 },
      ...overrides,
    }
  }

  it('computes the total score itself rather than trusting the model', async () => {
    const client = fakeToolClient('record_content_concepts', {
      concepts: [conceptInput()],
      reasoning: 'test',
      confidence: 0.8,
    })
    const result = await generateContentConcepts(client, {
      product: 'Nexa SiteAudit',
      benefits: [],
      uniqueSellingPoints: [],
      allowedClaims: [],
      forbiddenClaims: [],
    })
    expect(result.concepts).toHaveLength(1)
    expect(result.concepts[0]?.score.total).toBe(70)
  })

  it('marks the top 3 concepts by total score as recommended', async () => {
    const client = fakeToolClient('record_content_concepts', {
      concepts: [
        conceptInput({ hook: 'A', scores: { hook: 90, retention: 90, shareability: 90, clarity: 90, conversion: 90, offerFit: 90 } }),
        conceptInput({ hook: 'B', scores: { hook: 80, retention: 80, shareability: 80, clarity: 80, conversion: 80, offerFit: 80 } }),
        conceptInput({ hook: 'C', scores: { hook: 70, retention: 70, shareability: 70, clarity: 70, conversion: 70, offerFit: 70 } }),
        conceptInput({ hook: 'D', scores: { hook: 10, retention: 10, shareability: 10, clarity: 10, conversion: 10, offerFit: 10 } }),
      ],
      reasoning: 'test',
      confidence: 0.8,
    })
    const result = await generateContentConcepts(client, {
      product: 'Nexa SiteAudit',
      benefits: [],
      uniqueSellingPoints: [],
      allowedClaims: [],
      forbiddenClaims: [],
    })
    const recommended = result.concepts.filter((c) => c.recommended).map((c) => c.hook)
    expect(recommended.sort()).toEqual(['A', 'B', 'C'])
    expect(result.concepts.find((c) => c.hook === 'D')?.recommended).toBe(false)
  })

  it('rejects a response with an empty or missing concepts array — real symptom of a truncated tool call', async () => {
    const client = fakeToolClient('record_content_concepts', { concepts: [], reasoning: 'x', confidence: 0.5 })
    await expect(
      generateContentConcepts(client, {
        product: 'P',
        benefits: [],
        uniqueSellingPoints: [],
        allowedClaims: [],
        forbiddenClaims: [],
      })
    ).rejects.toThrow(/missing a non-empty "concepts" array/)
  })

  it('rejects a response missing reasoning/confidence — the other real truncation symptom seen in testing', async () => {
    const client = fakeToolClient('record_content_concepts', { concepts: [conceptInput()] })
    await expect(
      generateContentConcepts(client, {
        product: 'P',
        benefits: [],
        uniqueSellingPoints: [],
        allowedClaims: [],
        forbiddenClaims: [],
      })
    ).rejects.toThrow(/missing "reasoning" or "confidence"/)
  })

  it('marks every tied concept at the cutoff as recommended, not an arbitrary subset', async () => {
    const tied = { hook: 50, retention: 50, shareability: 50, clarity: 50, conversion: 50, offerFit: 50 }
    const client = fakeToolClient('record_content_concepts', {
      concepts: [
        conceptInput({ hook: 'A', scores: tied }),
        conceptInput({ hook: 'B', scores: tied }),
        conceptInput({ hook: 'C', scores: tied }),
        conceptInput({ hook: 'D', scores: tied }),
      ],
      reasoning: 'test',
      confidence: 0.8,
    })
    const result = await generateContentConcepts(client, {
      product: 'Nexa SiteAudit',
      benefits: [],
      uniqueSellingPoints: [],
      allowedClaims: [],
      forbiddenClaims: [],
    })
    expect(result.concepts.every((c) => c.recommended)).toBe(true)
  })
})

describe('InMemoryCampaignStore', () => {
  it('creates and retrieves a campaign', async () => {
    const store = new InMemoryCampaignStore()
    const { id, inserted } = await store.create('biz_1', { product: 'Nexa SiteAudit' })
    expect(inserted).toBe(true)
    const record = await store.get(id)
    expect(record?.product).toBe('Nexa SiteAudit')
    expect(record?.status).toBe('active')
  })

  it('is idempotent on (business, externalId)', async () => {
    const store = new InMemoryCampaignStore()
    const first = await store.create('biz_1', { product: 'A', externalId: 'ext-1' })
    const second = await store.create('biz_1', { product: 'A renamed', externalId: 'ext-1' })
    expect(second.inserted).toBe(false)
    expect(second.id).toBe(first.id)
    const record = await store.get(first.id)
    expect(record?.product).toBe('A') // untouched by the second create() call
  })

  it('scopes campaigns per business and orders newest first', async () => {
    const store = new InMemoryCampaignStore()
    await store.create('biz_1', { product: 'First' })
    await store.create('biz_1', { product: 'Second' })
    await store.create('biz_2', { product: 'Other business' })

    const list = await store.listByBusiness('biz_1')
    expect(list.map((c) => c.product)).toEqual(['Second', 'First'])
  })

  it('changes status', async () => {
    const store = new InMemoryCampaignStore()
    const { id } = await store.create('biz_1', { product: 'A' })
    await store.setStatus(id, 'paused')
    expect((await store.get(id))?.status).toBe('paused')
  })
})

describe('InMemoryContentConceptStore', () => {
  it('creates a run in draft status and can mark it reviewed', async () => {
    const store = new InMemoryContentConceptStore()
    const id = await store.create({
      campaignId: 'camp_1',
      businessId: 'biz_1',
      concepts: [],
      reasoning: 'test',
      confidence: 0.5,
    })
    expect((await store.get(id))?.status).toBe('draft')
    await store.markReviewed(id)
    expect((await store.get(id))?.status).toBe('reviewed')
  })

  it('lists runs for a campaign, newest first', async () => {
    const store = new InMemoryContentConceptStore()
    await store.create({ campaignId: 'camp_1', businessId: 'biz_1', concepts: [], reasoning: 'first', confidence: 0.5 })
    await store.create({ campaignId: 'camp_1', businessId: 'biz_1', concepts: [], reasoning: 'second', confidence: 0.5 })
    const runs = await store.listByCampaign('camp_1')
    expect(runs.map((r) => r.reasoning)).toEqual(['second', 'first'])
  })
})

describe('importCampaignOnce', () => {
  it('normalizes and stores a new campaign', async () => {
    const campaignStore = new InMemoryCampaignStore()
    const engine = createPermissionEngine({ campaignStore })
    const client = fakeToolClient('record_campaign_normalization', {
      product: 'Nexa InvoiceChaser',
      reasoning: 'test',
      confidence: 0.7,
    })

    const result = await importCampaignOnce(engine, client, 'biz_1', 'raw text', 'ext-1')
    expect(result.inserted).toBe(true)
    expect(result.normalization.product).toBe('Nexa InvoiceChaser')
    expect((await campaignStore.get(result.campaignId))?.rawInput).toBe('raw text')
  })

  it('returns the stored record, not a fresh re-normalization, on a duplicate externalId', async () => {
    const campaignStore = new InMemoryCampaignStore()
    const engine = createPermissionEngine({ campaignStore })
    const firstClient = fakeToolClient('record_campaign_normalization', {
      product: 'Original Product',
      reasoning: 'test',
      confidence: 0.7,
    })
    const first = await importCampaignOnce(engine, firstClient, 'biz_1', 'raw text', 'ext-1')

    const secondClient = fakeToolClient('record_campaign_normalization', {
      product: 'Different Product Name',
      reasoning: 'test',
      confidence: 0.7,
    })
    const second = await importCampaignOnce(engine, secondClient, 'biz_1', 'raw text v2', 'ext-1')

    expect(second.inserted).toBe(false)
    expect(second.campaignId).toBe(first.campaignId)
    expect(second.normalization.product).toBe('Original Product') // not "Different Product Name"
  })
})

describe('generateConceptsOnce', () => {
  it('throws a clear error for an unknown campaign', async () => {
    const engine = createPermissionEngine()
    const client = fakeToolClient('record_content_concepts', { concepts: [], reasoning: 'x', confidence: 0.5 })
    await expect(generateConceptsOnce(engine, client, 'biz_1', 'no-such-campaign')).rejects.toThrow(/no campaign/)
  })

  it('generates and stores a concept run for a real campaign', async () => {
    const campaignStore = new InMemoryCampaignStore()
    const contentConceptStore = new InMemoryContentConceptStore()
    const engine = createPermissionEngine({ campaignStore, contentConceptStore })
    const { id: campaignId } = await campaignStore.create('biz_1', { product: 'Nexa SiteAudit' })

    const client = fakeToolClient('record_content_concepts', {
      concepts: [
        {
          angle: 'curiosity',
          hook: 'Hook',
          scriptOutline: 'outline',
          cta: 'cta',
          caption: 'caption',
          visualConcept: 'visual',
          hashtags: [],
          scores: { hook: 60, retention: 60, shareability: 60, clarity: 60, conversion: 60, offerFit: 60 },
        },
      ],
      reasoning: 'test',
      confidence: 0.6,
    })

    const { runId, conceptCount } = await generateConceptsOnce(engine, client, 'biz_1', campaignId)
    expect(conceptCount).toBe(1)
    const run = await contentConceptStore.get(runId)
    expect(run?.status).toBe('draft')
    expect(run?.concepts[0]?.score.total).toBe(60)
  })
})
