import { describe, expect, it } from 'vitest'
import { reviewTransaction } from '../src/agents/transactionReviewAgent.js'
import type { MessagesClient } from '../src/llm/client.js'

function fakeClient(toolInput: unknown): MessagesClient {
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
              name: 'record_transaction_review',
              input: toolInput,
            },
          ],
        } as never
      },
    },
  }
}

describe('reviewTransaction', () => {
  it('returns the structured review result from the tool call', async () => {
    const client = fakeClient({
      reasoning: 'A refund is always worth a look.',
      worthFlagging: true,
      draftAlert: 'A $50 refund just went out — worth a quick check.',
      confidence: 0.9,
    })

    const result = await reviewTransaction(client, {
      type: 'refund',
      amountCents: 5000,
      currency: 'USD',
      status: 'succeeded',
    })

    expect(result).toEqual({
      reasoning: 'A refund is always worth a look.',
      worthFlagging: true,
      draftAlert: 'A $50 refund just went out — worth a quick check.',
      confidence: 0.9,
    })
  })

  it('throws if the model refuses instead of calling the tool', async () => {
    const client: MessagesClient = {
      messages: {
        async create() {
          return {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            stop_reason: 'refusal',
            stop_sequence: null,
            stop_details: { type: 'refusal', category: null, explanation: 'nope' },
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [],
          } as never
        },
      },
    }

    await expect(
      reviewTransaction(client, { type: 'charge', amountCents: 100, currency: 'USD', status: 'succeeded' })
    ).rejects.toThrow(/refused/)
  })

  it('throws if no tool_use block is present', async () => {
    const client: MessagesClient = {
      messages: {
        async create() {
          return {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: 'text', text: 'I have a question instead.' }],
          } as never
        },
      },
    }

    await expect(
      reviewTransaction(client, { type: 'charge', amountCents: 100, currency: 'USD', status: 'succeeded' })
    ).rejects.toThrow(/expected a "record_transaction_review" tool call/i)
  })
})
