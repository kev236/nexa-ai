import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { runWaitlistTriageOnce } from '../src/agents/runWaitlistTriage.js'
import { registerExecutor } from '../src/executors/registry.js'
import type { MessagesClient } from '../src/llm/client.js'
import type { BusinessAdapter, ObservedEvent } from '../src/adapters/types.js'

function fakeLlmClient(): MessagesClient {
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
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'record_triage',
              input: { reasoning: 'test', draftReply: 'Thanks!', confidence: 0.9 },
            },
          ],
        } as never
      },
    },
  }
}

function fakeAdapter(events: ObservedEvent[]): BusinessAdapter {
  return {
    adapterType: 'fake',
    async backfill() {
      return events
    },
    async observe() {
      return []
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

describe('runWaitlistTriageOnce', () => {
  it('drafts and submits a send_email action for each un-triaged event with an email', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestEvents(
      fakeAdapter([
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'a@b.com' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
      ]),
      'biz_1',
      'backfill'
    )

    const summary = await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1')
    expect(summary).toEqual({ triaged: 1, skipped: 0 })

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.request.actionType).toBe('send_email')
    expect(pending[0]?.request.payload).toEqual({ to: 'a@b.com', subject: "You're on the Nexa Labs waitlist", body: 'Thanks!' })
  })

  it('skips events that already have a decision, and events with no email in payload', async () => {
    const engine = createPermissionEngine()
    await engine.ingestEvents(
      fakeAdapter([
        { source: 'fake', type: 'contact_message', payload: { message: 'no email here' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
      ]),
      'biz_1',
      'backfill'
    )

    const summary = await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1')
    expect(summary).toEqual({ triaged: 0, skipped: 1 })
  })

  it('is idempotent — running twice only triages each event once', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestEvents(
      fakeAdapter([
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'a@b.com' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
      ]),
      'biz_1',
      'backfill'
    )

    await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1')
    const second = await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1')
    expect(second).toEqual({ triaged: 0, skipped: 1 })
  })

  it('stops at maxActions and reports why, instead of continuing (readme.md Agents section)', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestEvents(
      fakeAdapter([
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'a@b.com' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'b@b.com' }, occurredAt: '2026-01-02T00:00:00Z', externalId: 'ev-2' },
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'c@b.com' }, occurredAt: '2026-01-03T00:00:00Z', externalId: 'ev-3' },
      ]),
      'biz_1',
      'backfill'
    )

    const summary = await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1', { maxActions: 2 })
    expect(summary).toEqual({ triaged: 2, skipped: 0, stoppedReason: 'maxActions' })
  })

  it('stops once the wall-clock timeout elapses', async () => {
    registerExecutor('send_email', async (payload) => payload)
    const engine = createPermissionEngine()
    await engine.ingestEvents(
      fakeAdapter([
        { source: 'fake', type: 'waitlist_signup', payload: { email: 'a@b.com' }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'ev-1' },
      ]),
      'biz_1',
      'backfill'
    )

    const summary = await runWaitlistTriageOnce(engine, fakeLlmClient(), 'biz_1', 'agent_1', { timeoutMs: -1 })
    expect(summary).toEqual({ triaged: 0, skipped: 0, stoppedReason: 'timeout' })
  })
})
