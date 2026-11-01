
import Link from 'next/link'
import { requireRole } from '@/lib/session'
import { markNotificationRead } from '../actions'

export default async function NotificationsPage() {
  const { supabase, me } = await requireRole('manager', 'member', 'model')

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, link, is_read, created_at')
    .eq('person_id', me.id)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-white p-4">
        <h1 className="text-lg font-semibold">Notifications</h1>
        <p className="mt-2 text-sm text-red-600">
          Could not load notifications. Please try again.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-gray-600">
          Updates about your availability and Shoot Days.
        </p>
      </div>

      {!notifications?.length ? (
        <div className="rounded-xl border bg-white p-6 text-center">
          <p className="font-medium">You're all caught up.</p>
          <p className="mt-1 text-sm text-gray-500">
            New updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-xl border bg-white p-4 ${
                notification.is_read
                  ? 'border-gray-200'
                  : 'border-blue-200 bg-blue-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!notification.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                    )}
                    <h2 className="font-semibold">{notification.title}</h2>
                  </div>

                  <p className="mt-2 text-sm text-gray-700">
                    {notification.message}
                  </p>

                  <p className="mt-2 text-xs text-gray-500">
                    {new Date(notification.created_at).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>

                  {notification.link && (
                    <Link
                      href={notification.link}
                      className="mt-3 inline-block text-sm font-medium underline"
                    >
                      View details
                    </Link>
                  )}
                </div>

                {!notification.is_read && (
                  <form
                    action={markNotificationRead.bind(null, notification.id)}
                  >
                    <button className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
