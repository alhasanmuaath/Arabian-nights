import type { Metadata, Viewport } from 'next'
import { Motion } from '@/components/Motion'
import { Sky } from '@/components/Sky'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arabian Nights',
  description: 'Shoot schedule and crew',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0c1030', viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sky />
        <Motion />
        {children}
      </body>
    </html>
  )
}
