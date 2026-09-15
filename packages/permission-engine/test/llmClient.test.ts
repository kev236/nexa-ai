import { describe, expect, it } from 'vitest'
import { completeWithTool } from '../src/llm/client.js'
import type { MessagesClient, ToolSchema } from '../src/llm/client.js'

const TOOL: ToolSchema = {
  name: 'record_thing',
  description: 'test tool',
  inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
}

function clientWith(stopReason: string, content: unknown[]): MessagesClient {
  return {
    messages: {
      async create() {
        return {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: stopReason,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content,
        } as never
      },
    },
  }
}

describe('completeWithTool', () => {
  it('returns the tool call input on success', async () => {
    const client = clientWith('tool_use', [{ type: 'tool_use', id: 'toolu_1', name: 'record_thing', input: { value: 'x' } }])
    const result = await completeWithTool<{ value: string }>(client, 'sys', 'user', TOOL)
    expect(result).toEqual({ value: 'x' })
  })

  it('throws on refusal', async () => {
    const client = clientWith('refusal', [])
    await expect(completeWithTool(client, 'sys', 'user', TOOL)).rejects.toThrow(/refused/)
  })

  it('throws when no tool_use block is present', async () => {
    const client = clientWith('end_turn', [{ type: 'text', text: 'no tool call' }])
    await expect(completeWithTool(client, 'sys', 'user', TOOL)).rejects.toThrow(/expected a "record_thing" tool call/i)
  })

  it('throws a specific error when generation was truncated at maxTokens — a truncated tool call can still parse as valid-looking JSON missing fields', async () => {
    const client = clientWith('max_tokens', [
      { type: 'tool_use', id: 'toolu_1', name: 'record_thing', input: { value: 'partial, cut off' } },
    ])
    await expect(completeWithTool(client, 'sys', 'user', TOOL, 100)).rejects.toThrow(/truncated at maxTokens \(100\)/)
  })
})
