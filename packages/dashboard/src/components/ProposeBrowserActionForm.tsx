'use client'

import { useActionState, useState } from 'react'
import { proposeBrowserActionAction, type ProposeBrowserActionState } from '@/app/browser-actions/actions'

/**
 * Always lands in the approval queue (requiresReview — see
 * launchBrowserAction.ts) — this form never performs the action itself,
 * it only proposes one for you to review and approve on the Home page,
 * where the exact url/action/target you entered here shows up verbatim.
 */
export function ProposeBrowserActionForm() {
  const [state, formAction, pending] = useActionState<ProposeBrowserActionState, FormData>(proposeBrowserActionAction, undefined)
  const [actionType, setActionType] = useState<'click' | 'fill' | 'check'>('click')

  if (state?.approvalId) {
    return <p className="meta">Sent to the approval queue — it won&apos;t run until you approve it from the Home page.</p>
  }

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Page URL
        <input name="url" type="url" placeholder="https://example.com/signup" required />
      </label>
      <label>
        What to do
        <select name="actionType" value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}>
          <option value="click">Click</option>
          <option value="fill">Fill in text</option>
          <option value="check">Check a box</option>
        </select>
      </label>
      <label>
        Element type
        <select name="targetRole" defaultValue="button">
          <option value="button">Button</option>
          <option value="link">Link</option>
          <option value="textbox">Text field</option>
          <option value="checkbox">Checkbox</option>
        </select>
      </label>
      <label>
        Element name <span className="meta">(exactly as it reads on the page — e.g. &quot;Sign up&quot;, &quot;Email&quot;)</span>
        <input name="targetName" type="text" placeholder="Sign up" required />
      </label>
      {actionType === 'fill' && (
        <label>
          Text to type
          <input name="value" type="text" placeholder="you@example.com" required />
        </label>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send to approval queue'}
      </button>
    </form>
  )
}
