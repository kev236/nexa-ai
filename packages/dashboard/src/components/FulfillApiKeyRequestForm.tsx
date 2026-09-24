'use client'

import { useActionState, useState } from 'react'
import { fulfillApiKeyRequestAction, type FulfillRequestState } from '@/app/api-keys/actions'

export function FulfillApiKeyRequestForm({ requestId, email }: { requestId: string; email: string }) {
  const action = fulfillApiKeyRequestAction.bind(null, requestId, email)
  const [state, formAction, pending] = useActionState<FulfillRequestState, FormData>(action, undefined)
  const [copied, setCopied] = useState(false)

  if (state?.plaintextKey) {
    return (
      <div className="key-reveal">
        <code>{state.plaintextKey}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(state.plaintextKey ?? '').then(
              () => setCopied(true),
              () => {}
            )
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="opportunity-form">
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Generating…' : 'Generate key & mark fulfilled'}
      </button>
    </form>
  )
}
