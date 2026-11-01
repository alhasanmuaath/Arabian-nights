
import { Announcements } from '@/components/Announcements'
import { getMe, canEditAll } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function AnnouncementsPage() {
  const { supabase, user, me } = await getMe()

  if (!user) redirect('/login')
  if (!me) redirect('/no-access')

  const canManage = canEditAll(me)

  const [announcementResult, modelResult] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false }),

    canManage
      ? supabase
          .from('people')
          .select('id, name')
          .eq('role', 'model')
          .order('name')
      : Promise.resolve({ data: [], error: null }),
  ])

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="mt-1 text-sm text-gray-600">
          Important updates and information for the team.
        </p>
      </div>

      {announcementResult.error ? (
        <p role="alert" className="text-sm text-red-700">
          Could not load announcements: {announcementResult.error.message}
        </p>
      ) : modelResult.error ? (
        <p role="alert" className="text-sm text-red-700">
          Could not load the model list: {modelResult.error.message}
        </p>
      ) : (
        <Announcements
          models={modelResult.data ?? []}
          announcements={announcementResult.data ?? []}
          canManage={canManage}
        />
      )}
    </main>
  )
}
