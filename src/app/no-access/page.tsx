import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { getMe, homeFor } from '@/lib/session'

export default async function NoAccess() {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  if (me) redirect(homeFor(me))
  return (
    <AuthShell title="No access">
      <p className="muted mb-6">{user.email} is not on the team list. Ask the manager to invite this email address.</p>
      <form action="/auth/signout" method="post">
        <button className="btn w-full">Log out</button>
      </form>
    </AuthShell>
  )
}
