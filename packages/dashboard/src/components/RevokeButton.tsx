'use client'

import { useTransition } from 'react'

/**
 * Shared by /trusted-people and /api-keys — both used a bare
 * `<form action={revokeXAction.bind(...)}>` with no pending feedback (a
 * double-click double-submitted) and no confirmation before an
 * irreversible revoke. No dialog primitive exists in this app yet, so
 * window.confirm is the pragmatic minimal-risk choice rather than
 * introducing a new one for a single low-frequency action.
 */
export function RevokeButton({ action, confirmMessage, label = 'Revoke' }: { action: () => Promise<void>; confirmMessage: string; label?: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="deny"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) return
        startTransition(() => {
          action()
        })
      }}
    >
      {pending ? 'Revoking…' : label}
    </button>
  )
}
