'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSession, deleteSession } from '@/lib/session'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { SCORE_DIMENSIONS } from '@nexa-ai/permission-engine'
import type { OpportunityInput, OpportunityScores } from '@nexa-ai/permission-engine'

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

export type OpportunityFormState = { error?: string } | undefined

/** Shared by create and update — parses+validates the fixed set of score-dimension fields out of a submitted form. */
function parseOpportunityForm(formData: FormData): OpportunityInput | { error: string } {
  const name = formData.get('name')
  const problem = formData.get('problem')
  const targetCustomer = formData.get('targetCustomer')
  const recommendation = formData.get('recommendation')

  if (typeof name !== 'string' || !name.trim()) return { error: 'Name is required.' }
  if (typeof problem !== 'string' || !problem.trim()) return { error: 'Problem is required.' }
  if (typeof targetCustomer !== 'string' || !targetCustomer.trim()) {
    return { error: 'Target customer is required.' }
  }
  if (typeof recommendation !== 'string' || !recommendation.trim()) {
    return { error: 'Recommendation is required.' }
  }

  const scores = {} as Record<string, number>
  for (const { key, label } of SCORE_DIMENSIONS) {
    const raw = formData.get(key)
    const value = typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `${label} must be a number between 0 and 100.` }
    }
    scores[key] = value
  }

  return {
    name: name.trim(),
    problem: problem.trim(),
    targetCustomer: targetCustomer.trim(),
    scores: scores as unknown as OpportunityScores,
    recommendation: recommendation.trim(),
  }
}

export async function createOpportunity(
  _prevState: OpportunityFormState,
  formData: FormData
): Promise<OpportunityFormState> {
  await verifySession()
  const parsed = parseOpportunityForm(formData)
  if ('error' in parsed) return parsed

  await getEngine().opportunityStore.create(parsed)
  revalidatePath('/opportunities')
  redirect('/opportunities')
}

export async function updateOpportunity(
  id: string,
  _prevState: OpportunityFormState,
  formData: FormData
): Promise<OpportunityFormState> {
  await verifySession()
  const parsed = parseOpportunityForm(formData)
  if ('error' in parsed) return parsed

  await getEngine().opportunityStore.update(id, parsed)
  revalidatePath('/opportunities')
  redirect('/opportunities')
}

export async function setOpportunityStatus(id: string, status: 'open' | 'archived'): Promise<void> {
  await verifySession()
  await getEngine().opportunityStore.setStatus(id, status)
  revalidatePath('/opportunities')
}
