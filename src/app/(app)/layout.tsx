import { redirect } from 'next/navigation'
import { Nav } from '@/components/Nav'
import { getMe } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  if (!me) redirect('/no-access')

  const links =
    me.role === 'model'
      ? [
          { href: '/calendar', label: 'My calendar' },
          { href: '/progress', label: 'My progress' },
          { href: '/pay', label: 'My pay' },
        ]
      : me.role === 'manager'
        ? [
            { href: '/dashboard', label: 'Dashboard' },
            { href: '/pay-manager', label: 'Pay manager' },
            { href: '/people', label: 'People' },
          ]
        : [{ href: '/dashboard', label: 'Dashboard' }]

  const roleLabel =
    me.role === 'member' ? `member · ${me.access === 'edit' ? 'can edit' : 'view only'}` : me.role

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Shoot Scheduler</p>
            <p className="truncate text-xs text-gray-600">
              {me.name} · {roleLabel}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="btn border-gray-300 bg-white text-gray-800">Log out</button>
          </form>
        </div>
        <div className="mx-auto max-w-3xl">
          <Nav links={links} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 pb-16">{children}</main>
    </div>
  )
}
