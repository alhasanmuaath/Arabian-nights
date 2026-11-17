import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { fmtStamp } from '@/lib/dates'
import { requireRole } from '@/lib/session'
import { markAllNotificationsRead, markNotificationRead } from '../actions'

type Notification = {
  id: string
  title: string
  message: string
  type: string
  link: string | null
  is_read: boolean
  created_at: string
}

export default async function NotificationsPage() {
  const { supabase, me } = await requireRole()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, link, is_read, created_at')
    .eq('person_id', me.id)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100)
  const items = (data ?? []) as Notification[]
  const unread = items.filter((n) => !n.is_read).length

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{unread ? `${unread} unread` : 'All caught up'}</p>
          <h1 className="mt-1">Notifications</h1>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="btn btn-sm">
              <Icon name="check" size={15} /> Mark all read
            </button>
          </form>
        )}
      </header>

      {error && (
        <p role="alert" className="msg-error">
          Could not load notifications. Please try again.
        </p>
      )}

      {!items.length && !error && (
        <section className="glass glass-pad text-center">
          <Icon name="bell" size={28} className="mx-auto text-ink-3" />
          <p className="mt-2 font-medium">Nothing new</p>
          <p className="muted">Shoot days, answers and comments will show up here.</p>
        </section>
      )}

      {items.length > 0 && (
        <section className="glass divide overflow-hidden">
          {items.map((n) => (
            <article key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${n.is_read ? 'opacity-70' : ''}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-white/20' : 'bg-gold-400'}`} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px]">{n.title}</h2>
                <p className="muted break-words">{n.message}</p>
                <p className="faint mt-1 flex flex-wrap items-center gap-x-3">
                  {fmtStamp(n.created_at)}
                  {n.link && (
                    <Link href={n.link} className="link">
                      Open
                    </Link>
                  )}
                </p>
              </div>
              {!n.is_read && (
                <form action={markNotificationRead.bind(null, n.id)}>
                  <button className="btn btn-sm" aria-label={`Mark "${n.title}" as read`}>
                    <Icon name="check" size={15} />
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  )
}
