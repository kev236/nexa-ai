'use client'

import { useActionState } from 'react'
import type { OpportunityFormState } from '@/app/actions'

// Not imported from @nexa-ai/permission-engine here on purpose: this is a
// 'use client' component, and that package's index also re-exports the
// Postgres-backed stores (which import `pg`) — pulling it into a client
// bundle drags `pg` along with it and breaks the build. The page
// components (server-side) import the real SCORE_DIMENSIONS and pass it
// down as a prop instead; this local type is just the shape, not a
// second source of truth for the values.
type Dimension = { key: string; label: string; favorableHint: string }

type Props = {
  action: (prevState: OpportunityFormState, formData: FormData) => Promise<OpportunityFormState>
  dimensions: Dimension[]
  initial?: {
    name: string
    problem: string
    targetCustomer: string
    scores: Record<string, number>
    recommendation: string
  }
  submitLabel: string
}

/** Shared by /opportunities/new and /opportunities/[id]/edit — same 12-dimension rubric from the "empire OS" doc, entered manually by the owner. */
export function OpportunityForm({ action, dimensions, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Name
        <input name="name" type="text" defaultValue={initial?.name} required />
      </label>
      <label>
        Problem
        <textarea name="problem" rows={2} defaultValue={initial?.problem} required />
      </label>
      <label>
        Target customer
        <input name="targetCustomer" type="text" defaultValue={initial?.targetCustomer} required />
      </label>

      <div className="score-grid">
        {dimensions.map(({ key, label, favorableHint }) => (
          <label key={key} className="score-field">
            <span>
              {label} <span className="meta">({favorableHint})</span>
            </span>
            <input
              name={key}
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={initial?.scores[key]}
              required
            />
          </label>
        ))}
      </div>

      <label>
        Recommendation
        <input
          name="recommendation"
          type="text"
          placeholder="e.g. BUILD MVP, MONITOR, PASS"
          defaultValue={initial?.recommendation}
          required
        />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
