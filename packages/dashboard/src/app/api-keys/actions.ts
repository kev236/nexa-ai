'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getApiKeyStore, getApiKeyRequestStore } from '@/lib/engine'

export type CreateKeyState = { error?: string; plaintextKey?: string } | undefined

/** The one and only time a caller sees the real key — never stored, never shown again after this render. */
export async function createApiKeyAction(_prevState: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  await verifySession()
  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Name it after who/what it\'s for — you\'ll only see the key itself once.' }
  }

  const { plaintextKey } = await getApiKeyStore().create(name.trim())
  revalidatePath('/api-keys')
  return { plaintextKey }
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  await verifySession()
  await getApiKeyStore().revoke(id)
  revalidatePath('/api-keys')
}

export type FulfillRequestState = { error?: string; plaintextKey?: string } | undefined

/** Generates a key named after the requester's email and marks their /clip-api request fulfilled — one click instead of two separate steps. */
export async function fulfillApiKeyRequestAction(
  requestId: string,
  email: string,
  _prevState: FulfillRequestState,
  _formData: FormData
): Promise<FulfillRequestState> {
  await verifySession()
  const { plaintextKey } = await getApiKeyStore().create(email)
  await getApiKeyRequestStore().markFulfilled(requestId)
  revalidatePath('/api-keys')
  return { plaintextKey }
}
