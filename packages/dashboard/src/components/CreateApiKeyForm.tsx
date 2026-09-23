'use client'

import { useActionState, useState } from 'react'
import { createApiKeyAction, type CreateKeyState } from '@/app/api-keys/actions'

export function CreateApiKeyForm() {
  const [state, formAction, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, undefined)
  const [copied, setCopied] = useState(false)

  if (state?.plaintextKey) {
    return (
      <div className="card">
        <p className="reasoning">
          <strong>New key created — this is the only time you&apos;ll see it.</strong> Copy it now and send it to
          whoever&apos;s paying for access.
        </p>
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
      </div>
    )
  }

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Name (who/what this key is for)
        <input name="name" type="text" placeholder="e.g. Acme Creators" required />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Generate key'}
      </button>
    </form>
  )
}
