import Anthropic from '@anthropic-ai/sdk'

// The one place model choice is made — per this project's own convention
// ("Model choice is a routing decision made in one place, never hardcoded
// at a call site"). Every agent calls completeWithTool, never the SDK
// directly.
const MODEL = 'claude-opus-5'

/** Only what this module needs — keeps callers testable without a real API key. */
export type MessagesClient = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  }
}

export type ToolSchema = {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

/**
 * Forces Claude to respond via a single named tool call, so the result is
 * always structured data, never prose to parse. Throws if the model
 * doesn't return the expected tool_use block (e.g. it refused).
 */
export async function completeWithTool<T>(
  client: MessagesClient,
  system: string,
  userContent: string,
  tool: ToolSchema
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userContent }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude refused the request: ${JSON.stringify(response.stop_details)}`)
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  )
  if (!toolUse) {
    throw new Error(`Expected a "${tool.name}" tool call, got stop_reason "${response.stop_reason}"`)
  }
  return toolUse.input as T
}

export function createAnthropicClient(): MessagesClient {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.')
  }
  return new Anthropic({ apiKey })
}
