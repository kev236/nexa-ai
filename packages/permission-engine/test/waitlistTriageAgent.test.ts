import { describe, expect, it } from 'vitest'
import { triageEvent } from '../src/agents/waitlistTriageAgent.js'
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
              name: 'record_triage',
              input: toolInput,
            },
          ],
        } as never
      },
    },
  }
}

describe('triageEvent', () => {
  it('returns the structured triage result from the tool call', async () => {
    const client = fakeClient({
      reasoning: 'Standard waitlist signup, nothing unusual.',
      draftReply: 'Thanks for joining the waitlist!',
      confidence: 0.9,
    })

    const result = await triageEvent(client, {
      type: 'waitlist_signup',
      payload: { email: 'lead@example.com', productName: 'Nexa SiteAudit' },
    })

    expect(result).toEqual({
      reasoning: 'Standard waitlist signup, nothing unusual.',
      draftReply: 'Thanks for joining the waitlist!',
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
      triageEvent(client, { type: 'contact_message', payload: { message: 'hi' } })
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
      triageEvent(client, { type: 'contact_message', payload: { message: 'hi' } })
    ).rejects.toThrow(/expected a "record_triage" tool call/i)
  })
})
