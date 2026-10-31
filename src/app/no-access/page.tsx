import { redirect } from 'next/navigation'
import { getMe, homeFor } from '@/lib/session'

export default async function NoAccess() {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  if (me) redirect(homeFor(me))
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-2">No access</h1>
      <p className="muted mb-6">
        {user.email} is not on the team list. Ask the manager to invite this email address.
      </p>
      <form action="/auth/signout" method="post">
        <button className="btn border-gray-300 bg-white">Log out</button>
      </form>
    </main>
  )
}
