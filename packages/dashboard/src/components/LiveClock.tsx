'use client'

import { useEffect, useState } from 'react'

/**
 * A real, ticking local clock plus today's real date — not a decorative
 * fake readout. Renders nothing until mounted (SSR/first paint have no
 * reliable "now"), so there's no hydration mismatch; the initial blank
 * frame is invisible in practice since it fills in within one tick.
 */
export function LiveClock({ withDate = false }: { withDate?: boolean }) {
  const [now, setNow] = useState<Date | undefined>(undefined)

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!now) return null

  const time = now.toLocaleTimeString([], { hour12: false })
  if (!withDate) return <>{time}</>

  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <>
      {time} <span className="page-header-clock-sep">·</span> {date}
    </>
  )
}
