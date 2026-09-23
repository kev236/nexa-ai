/**
 * Normalizes a real value series into SVG coordinates for a small inline
 * trend chart — no charting library, just points a server component can
 * render directly. Returns null for fewer than 2 values (nothing to draw
 * a trend between).
 */
export function sparklinePath(values: number[], width: number, height: number, padding = 4) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (width - padding * 2) / (values.length - 1)

  const points = values.map((v, i) => {
    const x = padding + i * stepX
    const y = padding + (height - padding * 2) * (1 - (v - min) / span)
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const
  })

  const line = points.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`
  const last = points[points.length - 1]

  return { line, area, last }
}
