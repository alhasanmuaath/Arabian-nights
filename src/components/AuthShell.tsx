import { ViewTransition } from 'react'
import { Icon } from './Icon'

/** Frame for the log-in screens: 3D emblem, title, and a glass card. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <ViewTransition enter="rise" exit="sink" default="none">
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
        <div className="mb-7 text-center">
          <span className="orb" aria-hidden="true">
            <span className="orb-ring">
              <i />
            </span>
            <span className="orb-disc">
              <Icon name="moon" size={30} />
            </span>
          </span>
          <h1 className="text-[1.75rem]">{title}</h1>
          {subtitle && <p className="muted mt-1">{subtitle}</p>}
        </div>
        <div className="glass glass-pad" data-tilt>
          {children}
        </div>
        {footer}
      </main>
    </ViewTransition>
  )
}
