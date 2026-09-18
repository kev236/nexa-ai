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
 * doesn't return the expected tool_use block (e.g. it refused) or if
 * generation was cut off by maxTokens — a truncated tool call can still
 * come back as valid-looking JSON missing whatever fields hadn't been
 * generated yet when the limit hit, which a caller must not silently
 * treat as "the model chose to omit this." Discovered for real: the
 * Creative Agent's richer multi-concept output actually hit the default
 * 4096 and came back missing top-level fields with no other symptom.
 */
export async function completeWithTool<T>(
  client: MessagesClient,
  system: string,
  userContent: string,
  tool: ToolSchema,
  maxTokens = 4096
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
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
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `"${tool.name}" tool call was truncated at maxTokens (${maxTokens}) — the response is likely missing fields. Raise maxTokens or ask for less output per call.`
    )
  }
  return toolUse.input as T
}

/**
 * The chat-with-Nexa-AI feature's one call shape — auto tool_choice
 * (Claude decides whether/which read-only tool to call, possibly none),
 * unlike completeWithTool's forced single structured response. Still
 * routes through the one place model choice is made; the caller owns
 * the multi-turn loop and the tool handlers themselves (business-
 * specific read queries, not this package's concern).
 */
export async function chatTurn(
  client: MessagesClient,
  system: string,
  messages: Anthropic.MessageParam[],
  tools: ToolSchema[] = []
): Promise<Anthropic.Message> {
  return client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
    messages,
  })
}

export function createAnthropicClient(): MessagesClient {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.')
  }
  return new Anthropic({ apiKey })
}
