'use client'

import { useActionState } from 'react'
import { requestApiKeyAccessAction, type RequestAccessState } from '@/app/clip-api/actions'

export function RequestApiAccessForm() {
  const [state, formAction, pending] = useActionState<RequestAccessState, FormData>(requestApiKeyAccessAction, undefined)

  if (state?.success) {
    return (
      <div className="card">
        <p className="reasoning">
          <strong>Request sent.</strong> We&apos;ll reply by email with next steps — usually within a day.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Email
        <input name="email" type="email" placeholder="you@example.com" required />
      </label>
      <label>
        What would you use it for?
        <textarea name="useCase" rows={3} placeholder="e.g. scoring clips for my own repost channel before I edit them" required />
      </label>
      {/* Honeypot — hidden from real visitors via CSS, not a plain style="display:none" a bot filter might already skip past. */}
      <label className="visually-hidden" aria-hidden="true">
        Company website
        <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Request access'}
      </button>
    </form>
  )
}
