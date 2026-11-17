'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'

/** `also`: other paths that count as this tab (sub-pages opened from it). */
export type NavLink = { href: string; label: string; icon: IconName; also?: string[] }

/**
 * Tiny gold pulse inside a tab while its page is still loading. Only
 * visible when the page was not already prefetched (slow network).
 */
function Pending() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-gold-300 motion-safe:animate-pulse ${pending ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

const under = (path: string, href: string) => path === href || path.startsWith(href + '/')
const isActive = (path: string, l: NavLink) => under(path, l.href) || Boolean(l.also?.some((p) => under(path, p)))

/**
 * Which way the screen should turn: toward a tab on the right, or on the
 * left. No direction when the current page is not one of the tabs.
 */
function turn(current: number, target: number): string[] | undefined {
  if (current < 0 || current === target) return undefined
  return [target > current ? 'tab-next' : 'tab-prev']
}

/** Desktop: pill links in the header. */
export function TopNav({ links }: { links: NavLink[] }) {
  const path = usePathname()
  const current = links.findIndex((l) => isActive(path, l))
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {links.map((l, i) => {
        const active = i === current
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            transitionTypes={turn(current, i)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium ${
              active ? 'tab-on bg-white/14 text-ink' : 'text-ink-2 hover:bg-white/8 hover:text-ink'
            }`}
          >
            <Icon name={l.icon} size={16} className={`tab-icon ${active ? 'text-gold-300' : ''}`} />
            {l.label}
            <Pending />
          </Link>
        )
      })}
    </nav>
  )
}

/** Phone: fixed glass tab bar. At most five tabs. The highlight slides to the active one. */
export function TabBar({ links }: { links: NavLink[] }) {
  const path = usePathname()
  const current = links.findIndex((l) => isActive(path, l))
  return (
    <nav
      aria-label="Main"
      className="glass-bar fixed inset-x-3 z-40 mx-auto flex max-w-md items-stretch justify-between rounded-[1.75rem] px-1.5 py-1.5 md:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <span
        aria-hidden="true"
        className="tab-pill"
        style={{
          width: `calc((100% - 0.75rem) / ${links.length})`,
          transform: `translateX(${Math.max(current, 0) * 100}%)`,
          opacity: current < 0 ? 0 : 1,
        }}
      />
      {links.map((l, i) => {
        const active = i === current
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
            transitionTypes={turn(current, i)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.25rem] px-1 py-2 text-[11px] font-medium ${
              active ? 'tab-on text-ink' : 'text-ink-3'
            }`}
          >
            <Icon name={l.icon} size={20} className={`tab-icon ${active ? 'text-gold-300' : ''}`} />
            <span className="truncate">{l.label}</span>
            <Pending />
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
      transitionTypes={['drill-in']}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/12 ${
        active ? 'bg-white/16' : 'bg-white/6 hover:bg-white/12'
      }`}
    >
      <Icon name="bell" size={18} />
      {unread > 0 && (
        <span
          key={unread}
          className="badge-pop num absolute -right-1 -top-1 min-w-5 rounded-full bg-gold-400 px-1 text-center text-[11px] font-bold leading-5 text-night-950"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
