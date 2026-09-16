'use client'

import { useActionState } from 'react'
import { evaluateClipAction, type EvaluateClipState } from '@/app/clips/actions'

export function ClipForm() {
  const [state, formAction, pending] = useActionState<EvaluateClipState, FormData>(evaluateClipAction, undefined)

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Source URL (optional)
        <input name="sourceUrl" type="url" placeholder="https://..." />
      </label>
      <label>
        What happens in the clip
        <textarea
          name="sourceDescription"
          rows={3}
          placeholder="Who's in it, the platform it's from, and the moment that makes it worth reposting"
          required
        />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Evaluating…' : 'Evaluate clip'}
      </button>
    </form>
  )
}
