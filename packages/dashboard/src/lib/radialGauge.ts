/**
 * Shared math for the circular SVG progress rings used by Growth's
 * follower gauges and the demo page's opportunity gauge — one place so
 * both stay in sync on the stroke geometry.
 */
export function gaugeCircumference(radius: number): number {
  return 2 * Math.PI * radius
}

export function gaugeDashoffset(pct: number, circumference: number): number {
  const clamped = Math.min(100, Math.max(0, pct))
  return circumference * (1 - clamped / 100)
}
