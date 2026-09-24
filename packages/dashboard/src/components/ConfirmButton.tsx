'use client'

import { useTransition } from 'react'

/**
 * Any button whose action is destructive or hard to reverse — revoking
 * access, denying a request, archiving, pausing — gets the same two
 * things here instead of a bare `<form action={...}>`: a confirmation
 * before it fires, and visible pending feedback so a fast double-click
 * can't double-submit. No dialog primitive exists in this app yet, so
 * window.confirm is the pragmatic minimal-risk choice over introducing
 * a new one for what's always a single low-frequency action.
 */
export function ConfirmButton({
  action,
  confirmMessage,
  label,
  pendingLabel,
  className = 'deny',
}: {
  action: () => Promise<void>
  confirmMessage: string
  label: string
  pendingLabel?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) return
        startTransition(() => {
          action()
        })
      }}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  )
}
