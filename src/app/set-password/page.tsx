import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { getMe } from '@/lib/session'
import { SetPasswordForm } from './SetPasswordForm'

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  const { notice } = await searchParams
  return (
    <AuthShell
      title="Choose your password"
      subtitle={me ? `Welcome, ${me.name.split(' ')[0]}.` : user.email}
      footer={
        me && (
          <p className="mt-5 text-center">
            <Link href="/dashboard" className="link text-sm">
              Not now
            </Link>
          </p>
        )
      }
    >
      {notice && (
        <p role="alert" className="msg-error mb-4">
          {notice}
        </p>
      )}
      <p className="muted mb-4">You will use this password, with your email, every time you log in.</p>
      <SetPasswordForm />
    </AuthShell>
  )
}
