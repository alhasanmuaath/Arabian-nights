'use client'

import { useState } from 'react'

/**
 * A collapsible panel that remembers whether it is open, even when the
 * page re-renders after a save (a plain <details open={…}> would snap
 * shut or open again whenever the server value changes).
 */
export function Panel({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={`disclosure ${className}`}>
      <summary className="btn btn-primary">{summary}</summary>
      {children}
    </details>
  )
}
