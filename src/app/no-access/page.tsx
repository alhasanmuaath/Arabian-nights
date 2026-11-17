import { redirect } from 'next/navigation'
import { getMe, homeFor } from '@/lib/session'

export default async function NoAccess() {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  if (me) redirect(homeFor(me))
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="glass glass-pad">
        <h1 className="mb-2">No access</h1>
        <p className="muted mb-6">{user.email} is not on the team list. Ask the manager to invite this email address.</p>
        <form action="/auth/signout" method="post">
          <button className="btn w-full">Log out</button>
        </form>
      </div>
    </main>
  )
}
