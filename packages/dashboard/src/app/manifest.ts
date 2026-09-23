import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexa AI',
    short_name: 'Nexa AI',
    description: 'Owner approval dashboard for Nexa AI — revenue, approvals, growth, and agent activity.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070814',
    theme_color: '#070814',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
    ],
  }
}
