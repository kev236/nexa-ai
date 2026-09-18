import { ImageResponse } from 'next/og'

// Shared by icon.tsx, apple-icon.tsx, and the manifest's pwa-icon route —
// one glyph definition instead of three copies drifting apart. Colors are
// hard-coded (not var(--accent) etc.) because Satori renders this outside
// a real browser and doesn't resolve CSS custom properties.
const BG = '#070814'
const ACCENT = '#8b5cf6'
const ACCENT_STRONG = '#7c3aed'
const BORDER = 'rgba(139, 92, 246, 0.55)'

export function renderAppIcon(size: number) {
  const radius = Math.round(size * 0.22)
  const borderWidth = Math.max(1, Math.round(size * 0.035))
  const fontSize = Math.round(size * 0.5)
  const barWidth = Math.round(size * 0.26)
  const barHeight = Math.max(2, Math.round(size * 0.045))
  const gap = Math.round(size * 0.06)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap,
          background: BG,
          borderRadius: radius,
          border: `${borderWidth}px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'sans-serif',
            fontWeight: 700,
            fontSize,
            lineHeight: 1,
            color: ACCENT,
            letterSpacing: '-0.02em',
          }}
        >
          N
        </div>
        <div
          style={{
            display: 'flex',
            width: barWidth,
            height: barHeight,
            borderRadius: 999,
            background: ACCENT_STRONG,
          }}
        />
      </div>
    ),
    { width: size, height: size }
  )
}
