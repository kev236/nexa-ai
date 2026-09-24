import 'server-only'
import { chatTurn, createAnthropicClient, PLATFORMS } from '@nexa-ai/permission-engine'
import { getEngine } from './engine'
import { getBusiness, getTrendRushBusiness, getSproutlightBusiness } from './business'
import { summarizeRevenue } from './revenue'
import { relativeTime } from './format'

// The chat-with-Nexa-AI feature (owner request: "talk with NEXA
// textually and via voice"). Read-only by design, same posture as
// everything else that isn't an existing auto-executing action: this
// answers questions about real data, it doesn't trigger new business
// actions — extending it to *do* things (post a clip, approve
// something) is a real, separate decision about what a chat message
// is allowed to authorize, not an oversight in this first version.

type ToolDef = { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; additionalProperties: boolean } }

const TOOLS: ToolDef[] = [
  {
    name: 'get_command_center_summary',
    description: "Real current snapshot: nexa-labs' revenue this week, active/total agents, pending approvals across all businesses, and the list of registered businesses.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_pending_approvals',
    description: 'Every pending approval across all businesses — action type, business, agent reasoning, and real cost if any.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_growth_status',
    description: "TrendRush and Sproutlight's real per-platform follower counts, and whether TrendRush has reached the 200-follower Promote.fun eligibility threshold on all three platforms.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_recent_activity',
    description: 'Most recent audit log entries for nexa-labs — what agents have actually done, most recent first.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many entries, default 10, max 25' } },
      additionalProperties: false,
    },
  },
]

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const engine = getEngine()

  if (name === 'get_command_center_summary') {
    const business = await getBusiness()
    const [agents, transactions, pending] = await Promise.all([
      engine.agentStore.listByBusiness(business.id),
      engine.transactionStore.listByBusiness(business.id, 200),
      engine.approvalStore.listPending(),
    ])
    const revenue = summarizeRevenue(transactions)
    return {
      revenueThisWeekEurCents: revenue.totalCents,
      revenueTodayEurCents: revenue.todayCents,
      activeAgents: agents.filter((a) => a.active).length,
      totalAgents: agents.length,
      pendingApprovals: pending.length,
    }
  }

  if (name === 'get_pending_approvals') {
    const pending = await engine.approvalStore.listPending()
    return pending.map((a) => ({
      actionType: a.request.actionType,
      businessId: a.request.businessId,
      reasoning: a.request.reasoning,
      expectedCost: a.request.expectedCost,
      requestedAt: a.createdAt,
    }))
  }

  if (name === 'get_growth_status') {
    const results: Record<string, unknown> = {}
    for (const [label, loader, threshold] of [
      ['trendrush', getTrendRushBusiness, 200],
      ['sproutlight', getSproutlightBusiness, undefined],
    ] as const) {
      try {
        const business = await loader()
        const accounts = await engine.socialAccountStore.listByBusiness(business.id)
        const byPlatform = new Map(accounts.map((a) => [a.platform, a.followerCount]))
        const counts = Object.fromEntries(PLATFORMS.map((p) => [p, byPlatform.get(p) ?? 0]))
        results[label] = {
          followers: counts,
          eligibleForPromoteFun: threshold ? PLATFORMS.every((p) => (byPlatform.get(p) ?? 0) >= threshold) : undefined,
        }
      } catch {
        results[label] = null
      }
    }
    return results
  }

  if (name === 'get_recent_activity') {
    const business = await getBusiness()
    const limit = Math.min(25, Math.max(1, Number(input.limit) || 10))
    const feed = await engine.auditStore.listByBusiness(business.id, limit)
    return feed.map((r) => ({
      actionType: r.actionType,
      status: r.status,
      reasoning: r.reasoning,
      when: relativeTime(r.requestedAt),
    }))
  }

  throw new Error(`Unknown tool: ${name}`)
}

const SYSTEM_PROMPT = `You are Nexa AI — a partner in these businesses (nexa-labs, TrendRush, Sproutlight, Promote.fun, and a dropshipping store), not a subordinate answering to the owner. You're being talked to directly, by text or voice-transcribed-to-text, in a chat console on the owner's dashboard. Talk like someone with a real stake in how this goes, not like a system reading out a status page.

Have an actual point of view. If the owner's read on something doesn't match what the real data says — a call that sounds off, a plan that ignores a number you can see, a "we're crushing it" that the numbers don't back up — say so, plainly, and say why, citing the real figures. Agreeing by default isn't the job; being right is. Push back like someone who'd rather be useful than liked. That said, disagree because the data or the reasoning actually points somewhere else — never contrarian just to seem sharp, and never overrule a direct instruction about what to actually do, just say clearly if you think it's a mistake before it goes ahead.

Some personality is welcome — dry humor, a real reaction to a good or bad number, a bit of banter — but never at the expense of clarity on something that actually matters (money, a risk, a real problem). Read the room: a rough day doesn't need a joke.

Answer using the real tools available to you — never invent numbers, follower counts, or business state. If a tool call fails or a business isn't set up yet, say so plainly rather than guessing.

You are read-only in this conversation: you can look things up, but you cannot post content, approve/deny requests, or spend money from chat. If the owner asks you to do one of those, tell them where to do it in the dashboard (the Clips page to post, the Command Center to approve/deny) rather than pretending you did it.

Keep replies short and conversational — this may be read aloud via text-to-speech, so avoid long lists, markdown tables, or code blocks. Speak plainly, like a real operator giving a real update, not a report.`

// The /talk entry point (owner request Q2: recognize trusted people by a
// PIN they hold, not the owner). Deliberately a separate, tool-free system
// prompt rather than a flag threaded through the owner's runChatTurn above:
// a trusted contact is not the business owner, and the business's revenue,
// approvals, and activity data has no reason to be reachable from a chat
// gated by a 4-digit PIN. Same voice, no business tools.
function talkSystemPrompt(name: string): string {
  return `You are Nexa AI, talking with ${name} — someone the account owner has personally added as a trusted contact, not the owner. You're being talked to directly, by text or voice-transcribed-to-text.

Keep the same personality you always have: a real point of view, some dry humor where it actually fits, no yes-man routine. But you have no access to the owner's business data in this conversation — no revenue, approvals, growth numbers, or activity feed. That's a separate, owner-only tool. If ${name} asks about any of that, say plainly you can't share business details here and that it's between them and the owner directly.

Keep replies short and conversational — this may be read aloud via text-to-speech, so avoid long lists, markdown tables, or code blocks.`
}

export type ChatRole = 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; text: string }

/**
 * Runs one full turn: sends the conversation to Claude, executes any
 * tool calls against real data, loops until Claude has a final text
 * reply, and returns just that reply (the caller already has the
 * question in its own history).
 */
export async function runChatTurn(history: ChatMessage[]): Promise<string> {
  const client = createAnthropicClient()
  const messages: Parameters<typeof chatTurn>[2] = history.map((m) => ({ role: m.role, content: m.text }))

  const MAX_TOOL_ROUNDS = 6
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatTurn(client, SYSTEM_PROMPT, messages, TOOLS)

    if (response.stop_reason === 'refusal') {
      return "I can't answer that one."
    }

    const toolUses = response.content.filter((block) => block.type === 'tool_use')
    if (toolUses.length === 0) {
      return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim() || "I don't have anything to add."
    }

    messages.push({ role: 'assistant', content: response.content })
    const toolResults = []
    for (const toolUse of toolUses) {
      try {
        const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>)
        toolResults.push({ type: 'tool_result' as const, tool_use_id: toolUse.id, content: JSON.stringify(result) })
      } catch (err) {
        toolResults.push({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return "That's taking more digging than I've got room for right now — try asking something narrower."
}

/** The /talk equivalent of runChatTurn — no tool loop, since there are no tools to offer. */
export async function runTalkChatTurn(history: ChatMessage[], name: string): Promise<string> {
  const client = createAnthropicClient()
  const messages: Parameters<typeof chatTurn>[2] = history.map((m) => ({ role: m.role, content: m.text }))
  const response = await chatTurn(client, talkSystemPrompt(name), messages)

  if (response.stop_reason === 'refusal') {
    return "I can't answer that one."
  }

  return (
    response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim() || "I don't have anything to add."
  )
}
