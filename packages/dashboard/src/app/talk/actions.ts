'use server'

import { redirect } from 'next/navigation'
import { getTrustedPeopleStore } from '@/lib/engine'
import { createTrustedPersonSession, deleteTrustedPersonSession, readTrustedPersonSession } from '@/lib/trustedPersonSession'
import { runTalkChatTurn, type ChatMessage } from '@/lib/chat'

export type VerifyTrustedPersonState = { error?: string } | undefined

export async function verifyTrustedPersonAction(
  _prevState: VerifyTrustedPersonState,
  formData: FormData
): Promise<VerifyTrustedPersonState> {
  const name = formData.get('name')
  const pin = formData.get('pin')

  if (typeof name !== 'string' || !name.trim() || typeof pin !== 'string' || !pin) {
    return { error: 'Enter your name and PIN.' }
  }

  const person = await getTrustedPeopleStore().verify(name.trim(), pin)
  if (!person) {
    // Never distinguish "wrong name" from "wrong PIN" — same refusal
    // either way, so a stranger can't use the error to narrow a guess.
    return { error: "That name and PIN don't match anyone Nexa recognizes." }
  }

  await createTrustedPersonSession(person.id, person.name)
  redirect('/talk')
}

export async function talkLogoutAction(): Promise<void> {
  await deleteTrustedPersonSession()
  redirect('/talk')
}

export async function sendTalkMessageAction(history: ChatMessage[]): Promise<{ reply: string } | { error: string }> {
  const session = await readTrustedPersonSession()
  if (!session) {
    return { error: 'Session expired — enter your name and PIN again.' }
  }
  if (history.length === 0 || history[history.length - 1]?.role !== 'user') {
    return { error: 'No message to answer.' }
  }
  try {
    const reply = await runTalkChatTurn(history, session.name)
    return { reply }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Chat failed.' }
  }
}
