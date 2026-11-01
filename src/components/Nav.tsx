
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav({
  links,
  unreadCount = 0,
}: {
  links: { href: string; label: string }[]
  unreadCount?: number
}) {
  const path = usePathname()

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + '/')

        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
              active
                ? 'border-gray-900 font-semibold text-gray-900'
                : 'border-transparent text-gray-600'
            }`}
          >
            {l.label}
          </Link>
        )
      })}

      <Link
        href="/notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className={`relative ml-auto flex shrink-0 items-center gap-1 border-b-2 px-3 py-3 text-sm ${
          path.startsWith('/notifications')
            ? 'border-gray-900 font-semibold text-gray-900'
            : 'border-transparent text-gray-600'
        }`}
      >
        <span aria-hidden="true">♧</span>
        Notifications
        {unreadCount > 0 && (
          <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    </nav>
  )
}
