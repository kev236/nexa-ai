'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Counts up to a real value already computed server-side — this never
 * invents a number, it just animates the reveal of one the page already
 * fetched. Skips the animation under prefers-reduced-motion.
 */
export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(value)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }

    const duration = 700
    const start = performance.now()
    setDisplay(0)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setDisplay(Math.round(value * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [value])

  return (
    <>
      {display}
      {suffix}
    </>
  )
}
