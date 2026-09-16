'use client'

import { useEffect, useState } from 'react'

/**
 * A real, ticking local clock — not a decorative fake readout. Renders
 * nothing until mounted (SSR/first paint have no reliable "now"), so
 * there's no hydration mismatch; the initial blank frame is invisible
 * in practice since it fills in within one tick.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | undefined>(undefined)

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!now) return null

  return <>{now.toLocaleTimeString([], { hour12: false })}</>
}
