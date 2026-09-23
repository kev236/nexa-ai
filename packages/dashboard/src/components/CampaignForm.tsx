'use client'

import { useActionState } from 'react'
import { createCampaign, type CampaignFormState } from '@/app/campaigns/actions'

export function CampaignForm({ businessSlug }: { businessSlug: string }) {
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(createCampaign, undefined)

  return (
    <form action={formAction} className="opportunity-form">
      <input type="hidden" name="business" value={businessSlug} />
      <label>
        Campaign brief
        <textarea
          name="rawInput"
          rows={10}
          placeholder="Paste the raw campaign text — product, audience, benefits, allowed/forbidden claims, CTA, whatever the brief actually says. The Campaign Agent only extracts what's here; it never invents anything the brief doesn't state."
          required
        />
      </label>
      <label>
        External ID <span className="meta">(optional — the platform&apos;s own campaign id, for idempotent re-import)</span>
        <input name="externalId" type="text" placeholder="e.g. a Promote.fun campaign id" />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Importing…' : 'Import campaign'}
      </button>
    </form>
  )
}
