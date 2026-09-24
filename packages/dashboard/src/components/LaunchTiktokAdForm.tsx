'use client'

import { useActionState } from 'react'
import { launchTiktokAdAction, type LaunchTiktokAdState } from '@/app/campaigns/actions'

/**
 * Always lands in the pending-approval queue (expectedCost is set — see
 * tiktokAdsLaunch.ts) — this form's job is just to get a real daily
 * budget and an existing TikTok video onto that queue, never to spend
 * anything itself. The owner still has to click Approve on the Home page.
 */
export function LaunchTiktokAdForm({ campaignId }: { campaignId: string }) {
  const action = launchTiktokAdAction.bind(null, campaignId)
  const [state, formAction, pending] = useActionState<LaunchTiktokAdState, FormData>(action, undefined)

  if (state?.approvalId) {
    return (
      <p className="meta">
        Sent to the approval queue — nothing spends until you approve it from the Home page.
      </p>
    )
  }

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        TikTok video ID to boost <span className="meta">(the already-posted video's item id)</span>
        <input name="tiktokItemId" type="text" placeholder="e.g. 7123456789012345678" required />
      </label>
      <label>
        Daily budget (EUR)
        <input name="dailyBudgetEuros" type="number" step="0.01" min="0.01" defaultValue="10" required />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send to approval queue'}
      </button>
    </form>
  )
}
