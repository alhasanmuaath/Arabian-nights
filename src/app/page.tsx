import { redirect } from 'next/navigation'
import { getMe, homeFor } from '@/lib/session'

export default async function Home() {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  if (!me) redirect('/no-access')
  redirect(homeFor(me))
}
