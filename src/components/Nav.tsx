'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'

export type NavLink = { href: string; label: string; icon: IconName; external?: boolean }

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + '/')
}

/** Desktop: pill links in the header. */
export function TopNav({ links }: { links: NavLink[] }) {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {links.map((l) => {
        const active = isActive(path, l.href)
        const cls = `flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium ${
          active ? 'bg-white/14 text-ink' : 'text-ink-2 hover:bg-white/8 hover:text-ink'
        }`
        return l.external ? (
          <a key={l.href} href={l.href} className={cls}>
            <Icon name={l.icon} size={16} />
            {l.label}
          </a>
        ) : (
          <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined} className={cls}>
            <Icon name={l.icon} size={16} className={active ? 'text-gold-300' : ''} />
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Phone: fixed glass tab bar. At most five tabs. */
export function TabBar({ links }: { links: NavLink[] }) {
  const path = usePathname()
  return (
    <nav
      aria-label="Main"
      className="glass-bar fixed inset-x-3 z-40 mx-auto flex max-w-md items-stretch justify-between rounded-[1.75rem] px-1.5 py-1.5 md:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {links.map((l) => {
        const active = isActive(path, l.href)
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.25rem] px-1 py-2 text-[11px] font-medium ${
              active ? 'bg-white/14 text-ink' : 'text-ink-3'
            }`}
          >
            <Icon name={l.icon} size={20} className={active ? 'text-gold-300' : ''} />
            <span className="truncate">{l.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function BellLink({ unread }: { unread: number }) {
  const path = usePathname()
  const active = path.startsWith('/notifications')
  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/12 ${
        active ? 'bg-white/16' : 'bg-white/6 hover:bg-white/12'
      }`}
    >
      <Icon name="bell" size={18} />
      {unread > 0 && (
        <span className="num absolute -right-1 -top-1 min-w-5 rounded-full bg-gold-400 px-1 text-center text-[11px] font-bold leading-5 text-night-950">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
