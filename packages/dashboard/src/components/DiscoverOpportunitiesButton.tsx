'use client'

import { useActionState } from 'react'
import { discoverOpportunities, type DiscoverOpportunitiesState } from '@/app/opportunities/actions'

export function DiscoverOpportunitiesButton() {
  const [state, formAction, pending] = useActionState<DiscoverOpportunitiesState, FormData>(
    discoverOpportunities,
    undefined
  )

  return (
    <form action={formAction}>
      <button type="submit" className="button-link" disabled={pending}>
        {pending ? 'Discovering…' : 'Discover opportunities'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.proposed !== undefined && (
        <p className="meta">
          Proposed {state.proposed} new opportunit{state.proposed === 1 ? 'y' : 'ies'} — see the list below.
        </p>
      )}
    </form>
  )
}
