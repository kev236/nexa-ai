'use server'

import { verifySession } from '@/lib/dal'
import { getApiKeyRequestStore } from '@/lib/engine'

export type RequestAccessState = { error?: string; success?: boolean } | undefined

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Step 31 originally left this action open on purpose (the page it
 * belongs to was meant to be public). The owner decided against any
 * public surface on this app at all — /clip-api itself now calls
 * verifySession() too, so this is here for the same reason every other
 * server action in this codebase calls it: a Server Action is its own
 * reachable endpoint regardless of whether the page that renders its
 * form is gated, so gating only the page and not the action would have
 * left a real hole.
 */
export async function requestApiKeyAccessAction(_prevState: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  await verifySession()
  // A hidden field real visitors never fill in; a bot's autofill often does.
  const honeypot = formData.get('company_website')
  if (typeof honeypot === 'string' && honeypot.trim()) {
    return { success: true } // pretend success, don't let a bot learn its submission was rejected
  }

  const email = formData.get('email')
  const useCase = formData.get('useCase')
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return { error: 'Enter a real email address.' }
  }
  if (typeof useCase !== 'string' || !useCase.trim()) {
    return { error: "Tell us what you'd use it for — one sentence is enough." }
  }

  await getApiKeyRequestStore().create(email.trim(), useCase.trim())
  return { success: true }
}
