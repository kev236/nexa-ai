'use server'

import { getApiKeyRequestStore } from '@/lib/engine'

export type RequestAccessState = { error?: string; success?: boolean } | undefined

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Step 31: the ONLY server action on this route that doesn't call
 * verifySession() — deliberately, this page is public. No dashboard
 * data is read or returned here, only a new row written to an inbox
 * only the owner's /api-keys page can see.
 */
export async function requestApiKeyAccessAction(_prevState: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
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
