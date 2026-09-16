import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nexa AI — Approvals',
  description: 'Owner approval dashboard for Nexa AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
