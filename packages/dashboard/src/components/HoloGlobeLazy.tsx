'use client'

// `ssr: false` isn't allowed directly inside a Server Component in this
// Next.js version — it has to live in a Client Component boundary. This
// file exists solely to host that boundary so page.tsx (a Server
// Component) can still code-split the ~500KB three.js globe out of its
// initial bundle.
import dynamic from 'next/dynamic'

export const HoloGlobeLazy = dynamic(() => import('@/components/HoloGlobe').then((mod) => mod.HoloGlobe), {
  ssr: false,
})
