import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nexa AI — Approvals',
  description: 'Owner approval dashboard for Nexa AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
