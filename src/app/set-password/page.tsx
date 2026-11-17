import { redirect } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { getMe } from '@/lib/session'
import { SetPasswordForm } from './SetPasswordForm'

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { user, me } = await getMe()
  if (!user) redirect('/login')
  const { notice } = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="glass mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <Icon name="moon" size={28} className="text-gold-300" />
        </span>
        <h1 className="text-[1.75rem]">Choose your password</h1>
        <p className="muted mt-1">{me ? `Welcome, ${me.name.split(' ')[0]}.` : user.email}</p>
      </div>
      <div className="glass glass-pad">
        {notice && (
          <p role="alert" className="msg-error mb-4">
            {notice}
          </p>
        )}
        <p className="muted mb-4">You will use this password, with your email, every time you log in.</p>
        <SetPasswordForm />
      </div>
      {me && (
        <p className="mt-5 text-center">
          <a href="/dashboard" className="link text-sm">
            Not now
          </a>
        </p>
      )}
    </main>
  )
}
