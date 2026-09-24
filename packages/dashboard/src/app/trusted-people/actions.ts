'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getTrustedPeopleStore } from '@/lib/engine'

export type AddTrustedPersonState = { error?: string } | undefined

export async function addTrustedPersonAction(_prevState: AddTrustedPersonState, formData: FormData): Promise<AddTrustedPersonState> {
  const { ownerId } = await verifySession()
  const name = formData.get('name')
  const pin = formData.get('pin')

  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Name it after who this is for — it\'s what they\'ll say to identify themselves.' }
  }
  if (typeof pin !== 'string' || pin.trim().length < 4) {
    return { error: 'PIN must be at least 4 characters — longer is safer against guessing.' }
  }

  await getTrustedPeopleStore().add(name.trim(), pin.trim(), ownerId)
  revalidatePath('/trusted-people')
  return undefined
}

export async function revokeTrustedPersonAction(id: string): Promise<void> {
  await verifySession()
  await getTrustedPeopleStore().revoke(id)
  revalidatePath('/trusted-people')
}
