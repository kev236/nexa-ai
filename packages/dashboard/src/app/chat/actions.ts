'use server'

import { verifySession } from '@/lib/dal'
import { runChatTurn, type ChatMessage } from '@/lib/chat'

export type SendChatMessageState = { error?: string } | undefined

export async function sendChatMessageAction(history: ChatMessage[]): Promise<{ reply: string } | { error: string }> {
  await verifySession()
  if (history.length === 0 || history[history.length - 1]?.role !== 'user') {
    return { error: 'No message to answer.' }
  }
  try {
    const reply = await runChatTurn(history)
    return { reply }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Chat failed.' }
  }
}
