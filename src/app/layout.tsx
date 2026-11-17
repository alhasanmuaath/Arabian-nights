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

/**
 * Decides, before the first paint, whether the app moves. Motion is on unless the
 * device asks for reduced motion, and the switch in Me (saved as "motion") wins over the device.
 */
const motionScript = `(function(){try{var d=document.documentElement,m=null;try{m=localStorage.getItem('motion')}catch(e){}var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;d.dataset.motion=(m==='on'||(m!=='off'&&!r))?'on':'off'}catch(e){document.documentElement.dataset.motion='on'}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionScript }} />
      </head>
      <body>
        <Sky />
        <Motion />
        {children}
      </body>
    </html>
  )
}
