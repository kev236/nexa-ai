'use client'

import { useActionState } from 'react'
import { addTrustedPersonAction, type AddTrustedPersonState } from '@/app/trusted-people/actions'

export function AddTrustedPersonForm() {
  const [state, formAction, pending] = useActionState<AddTrustedPersonState, FormData>(addTrustedPersonAction, undefined)

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Name
        <input name="name" type="text" placeholder="e.g. Mom, Alex" required />
      </label>
      <label>
        PIN <span className="meta">(tell them this — it&apos;s how Nexa recognizes them, not their voice or face)</span>
        <input name="pin" type="text" inputMode="numeric" placeholder="At least 4 characters" minLength={4} required />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add trusted person'}
      </button>
    </form>
  )
}
