'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + '/')
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
              active ? 'border-gray-900 font-semibold text-gray-900' : 'border-transparent text-gray-600'
            }`}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
