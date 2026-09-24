'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { launchBrowserAction } from '@/lib/launchBrowserAction'

export type ProposeBrowserActionState = { error?: string; approvalId?: string } | undefined

const ACTION_TYPES = ['click', 'fill', 'check'] as const
const TARGET_ROLES = ['button', 'link', 'textbox', 'checkbox'] as const

export async function proposeBrowserActionAction(
  _prevState: ProposeBrowserActionState,
  formData: FormData
): Promise<ProposeBrowserActionState> {
  await verifySession()

  const url = formData.get('url')
  const actionType = formData.get('actionType')
  const targetRole = formData.get('targetRole')
  const targetName = formData.get('targetName')
  const value = formData.get('value')

  if (typeof url !== 'string' || !url.trim() || !/^https?:\/\//.test(url.trim())) {
    return { error: 'URL must start with http:// or https://' }
  }
  if (typeof actionType !== 'string' || !ACTION_TYPES.includes(actionType as (typeof ACTION_TYPES)[number])) {
    return { error: 'Choose an action type.' }
  }
  if (typeof targetRole !== 'string' || !TARGET_ROLES.includes(targetRole as (typeof TARGET_ROLES)[number])) {
    return { error: 'Choose what kind of element this is.' }
  }
  if (typeof targetName !== 'string' || !targetName.trim()) {
    return { error: 'Name the element as it reads on the page — e.g. "Sign up", "Email".' }
  }
  if (actionType === 'fill' && (typeof value !== 'string' || !value.trim())) {
    return { error: 'Filling a field needs the exact text to type.' }
  }

  try {
    const business = await getBusiness()
    const outcome = await launchBrowserAction(getEngine(), business.id, {
      url: url.trim(),
      actionType: actionType as (typeof ACTION_TYPES)[number],
      targetRole: targetRole as (typeof TARGET_ROLES)[number],
      targetName: targetName.trim(),
      value: typeof value === 'string' && value.trim() ? value.trim() : undefined,
    })
    if (outcome.status === 'denied') {
      return { error: `Request was denied: ${outcome.reason}` }
    }
    revalidatePath('/')
    return outcome.status === 'pending_approval' ? { approvalId: outcome.approvalId } : undefined
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to submit the action.' }
  }
}
