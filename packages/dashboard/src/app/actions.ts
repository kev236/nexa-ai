'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSession, deleteSession } from '@/lib/session'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'

export type LoginState = { error?: string } | undefined

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: 'Email and password are required.' }
  }

  const result = await getEngine().verifyOwnerCredentials(email, password)
  if (!result) {
    return { error: 'Invalid email or password.' }
  }

  await createSession(result.ownerId)
  redirect('/')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}

export async function resolveApproval(approvalId: string, decision: 'approved' | 'denied'): Promise<void> {
  const { ownerId } = await verifySession()
  await getEngine().resolveApproval(approvalId, decision, ownerId)
  revalidatePath('/')
}
