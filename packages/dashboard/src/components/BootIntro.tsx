'use client'

import { useEffect, useState } from 'react'

const SEEN_KEY = 'nexa-boot-seen'

/**
 * A one-time "systems online" flourish on first load of the dashboard
 * this browser session — sessionStorage-gated so it doesn't replay on
 * every navigation back to Approvals. Renders null on both the server
 * pass and the client's first paint, so there's no hydration mismatch;
 * it only appears once an effect confirms this session hasn't seen it.
 */
export function BootIntro() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(SEEN_KEY)) return

    window.sessionStorage.setItem(SEEN_KEY, '1')
    setShow(true)
    const timer = window.setTimeout(() => setShow(false), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div className="boot-intro" role="presentation" aria-hidden="true">
      <div className="boot-intro-line" />
      <p className="boot-intro-text">Nexa AI — systems online</p>
    </div>
  )
}
