import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { Icon, type IconName } from '@/components/Icon'
import { MotionSwitch } from '@/components/MotionSwitch'
import { ROLE_LABEL, requireRole } from '@/lib/session'

export default async function Me() {
  const { me } = await requireRole()
  const links: { href: string; label: string; icon: IconName; note?: string; download?: boolean }[] =
    me.role === 'manager'
      ? [
          { href: '/pay-manager', label: 'Pay manager', icon: 'wallet', note: 'Rates, payments, who is owed' },
          { href: '/people', label: 'People', icon: 'users', note: 'Invite the team and set roles' },
          { href: '/notifications', label: 'Notifications', icon: 'bell' },
          { href: '/api/manager/export', label: 'Export data', icon: 'download', note: 'Excel files in a zip', download: true },
        ]
      : [
          { href: '/pay', label: 'My pay', icon: 'wallet', note: 'Only you and the manager can see this' },
          { href: '/notifications', label: 'Notifications', icon: 'bell' },
        ]
  links.push({ href: '/set-password', label: 'Change password', icon: 'edit', note: 'Choose a new password' })

  return (
    <>
      <section className="glass glass-pad flex items-center gap-4">
        <Avatar name={me.name} size={56} />
        <div className="min-w-0">
          <h1 className="truncate">{me.name}</h1>
          <p className="muted truncate">{me.email}</p>
          <span className="chip chip-role mt-1.5">{ROLE_LABEL[me.role]}</span>
        </div>
      </section>

      <section className="glass divide overflow-hidden">
        {links.map((l) => {
          const inner = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8">
                <Icon name={l.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.label}</span>
                {l.note && <span className="faint block">{l.note}</span>}
              </span>
              <Icon name="chevron" className="text-ink-3" />
            </>
          )
          const cls = 'flex items-center gap-3 px-4 py-3.5 no-underline hover:bg-white/6'
          return l.download ? (
            <a key={l.href} href={l.href} className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={l.href} href={l.href} transitionTypes={['drill-in']} className={cls}>
              {inner}
            </Link>
          )
        })}
      </section>

      <MotionSwitch />

      <form action="/auth/signout" method="post">
        <button className="btn w-full">
          <Icon name="logout" size={16} />
          Log out
        </button>
      </form>
    </>
  )
}
