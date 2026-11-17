import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { BellLink, TabBar, TopNav, type NavLink } from '@/components/Nav'
import { getMe, getSupabase } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabase()
  // Both run at the same time. Row-level security only returns the caller's own notifications.
  const [{ user, me }, { count }] = await Promise.all([
    getMe(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])
  if (!user) redirect('/login')
  if (!me) redirect('/no-access')

  const main: NavLink[] = [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/shoots', label: 'Shoots', icon: 'calendar' },
    { href: '/announcements', label: 'News', icon: 'megaphone' },
    { href: '/files', label: 'Files', icon: 'folder' },
  ]
  const desktop: NavLink[] =
    me.role === 'manager'
      ? [...main, { href: '/pay-manager', label: 'Pay', icon: 'wallet' }, { href: '/people', label: 'People', icon: 'users' }]
      : [...main, { href: '/pay', label: 'My pay', icon: 'wallet' }]
  const phone: NavLink[] = [...main, { href: '/me', label: 'Me', icon: 'dots' }]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass-bar mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full py-2 pl-4 pr-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 no-underline">
            <Icon name="moon" size={18} className="text-gold-300" />
            <span className="truncate text-[15px] font-semibold tracking-tight">Arabian Nights</span>
          </Link>
          <TopNav links={desktop} />
          <div className="flex items-center gap-2">
            <BellLink unread={count ?? 0} />
            <Link href="/me" aria-label="My account" className="rounded-full">
              <Avatar name={me.name} size={40} />
            </Link>
          </div>
        </div>
      </header>

      <main className="pb-tabbar mx-auto max-w-5xl space-y-5 px-4 pt-6">{children}</main>

      <TabBar links={phone} />
    </div>
  )
}
