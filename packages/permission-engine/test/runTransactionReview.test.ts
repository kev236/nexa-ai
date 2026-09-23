import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { runTransactionReviewOnce } from '../src/agents/runTransactionReview.js'
import { registerExecutor } from '../src/executors/registry.js'
import type { MessagesClient } from '../src/llm/client.js'
import type { BusinessAdapter, ObservedTransaction } from '../src/adapters/types.js'

const OWNER_EMAIL = 'owner@example.com'

function fakeLlmClient(toolInput: unknown): MessagesClient {
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
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_transaction_review', input: toolInput }],
        } as never
      },
    },
  }
}

function fakeAdapter(transactions: ObservedTransaction[]): BusinessAdapter {
  return {
    adapterType: 'fake',
    async backfill() {
      return []
    },
    async observe() {
      return []
    },
    async listTransactions() {
      return transactions
    },
    listActions() {
      return []
    },
    async execute() {
      throw new Error('not implemented')
    },
    async healthCheck() {
      return { ok: true }
    },
  }
}

describe('runTransactionReviewOnce', () => {
  it('drafts and submits an owner alert for a transaction worth flagging', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'refund', amountCents: 5000, currency: 'USD', externalRef: 'txn-1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      ]),
      'biz_1'
    )

    const llmClient = fakeLlmClient({
      reasoning: 'Refunds are always worth a look.',
      worthFlagging: true,
      draftAlert: 'A $50 refund just went out.',
      confidence: 0.9,
    })

    const summary = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL)
    expect(summary).toEqual({ reviewed: 1, flagged: 1 })

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.request.actionType).toBe('send_email')
    expect(pending[0]?.request.payload).toEqual({
      to: OWNER_EMAIL,
      subject: 'Nexa AI: refund worth a look',
      body: 'A $50 refund just went out.',
    })
  })

  it('still alerts the owner when worthFlagging is true but the model left draftAlert empty', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'payout', amountCents: 250000, currency: 'USD', externalRef: 'txn-2', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      ]),
      'biz_1'
    )

    // A real, reachable response shape: transaction-review.md's own tool
    // schema doesn't require draftAlert even when worthFlagging is true.
    const llmClient = fakeLlmClient({
      reasoning: 'Unusually large payout.',
      worthFlagging: true,
      confidence: 0.7,
    })

    const summary = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL)
    expect(summary).toEqual({ reviewed: 1, flagged: 1 })

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.request.actionType).toBe('send_email')
    const payload = pending[0]?.request.payload as { to: string; subject: string; body: string }
    expect(payload.to).toBe(OWNER_EMAIL)
    expect(payload.body).toMatch(/didn't draft alert text/)
    expect(payload.body).toMatch(/Unusually large payout/)
  })

  it('records a decision but requests no action for a routine transaction', async () => {
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'charge', amountCents: 500, currency: 'USD', externalRef: 'txn-1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      ]),
      'biz_1'
    )

    const llmClient = fakeLlmClient({
      reasoning: 'Ordinary small charge, nothing unusual.',
      worthFlagging: false,
      confidence: 0.95,
    })

    const summary = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL)
    expect(summary).toEqual({ reviewed: 1, flagged: 0 })
    expect(await engine.listPendingApprovals()).toHaveLength(0)

    const decisions = await engine.decisionStore.listByBusiness('biz_1')
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.actionType).toBe('none')
  })

  it('is idempotent — running twice only reviews each transaction once', async () => {
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'charge', amountCents: 500, currency: 'USD', externalRef: 'txn-1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      ]),
      'biz_1'
    )

    const llmClient = fakeLlmClient({ reasoning: 'routine', worthFlagging: false, confidence: 0.9 })
    await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL)
    const second = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL)
    expect(second).toEqual({ reviewed: 0, flagged: 0 })
  })

  it('stops at maxActions and reports why, instead of continuing (readme.md Agents section)', async () => {
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'charge', amountCents: 100, currency: 'USD', externalRef: 'txn-1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
        { type: 'charge', amountCents: 100, currency: 'USD', externalRef: 'txn-2', status: 'succeeded', occurredAt: '2026-01-02T00:00:00Z' },
        { type: 'charge', amountCents: 100, currency: 'USD', externalRef: 'txn-3', status: 'succeeded', occurredAt: '2026-01-03T00:00:00Z' },
      ]),
      'biz_1'
    )

    const llmClient = fakeLlmClient({ reasoning: 'routine', worthFlagging: false, confidence: 0.9 })
    const summary = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL, { maxActions: 2 })
    expect(summary).toEqual({ reviewed: 2, flagged: 0, stoppedReason: 'maxActions' })
  })

  it('stops once the wall-clock timeout elapses', async () => {
    const engine = createPermissionEngine()
    await engine.ingestTransactions(
      fakeAdapter([
        { type: 'charge', amountCents: 100, currency: 'USD', externalRef: 'txn-1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      ]),
      'biz_1'
    )

    const llmClient = fakeLlmClient({ reasoning: 'routine', worthFlagging: false, confidence: 0.9 })
    const summary = await runTransactionReviewOnce(engine, llmClient, 'biz_1', 'agent_1', OWNER_EMAIL, { timeoutMs: -1 })
    expect(summary).toEqual({ reviewed: 0, flagged: 0, stoppedReason: 'timeout' })
  })
})
