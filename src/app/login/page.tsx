import { redirect } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { getMe } from '@/lib/session'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getMe()
  if (user) redirect('/')
  const { error } = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="glass mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <Icon name="moon" size={28} className="text-gold-300" />
        </span>
        <h1 className="text-[1.75rem]">Arabian Nights</h1>
        <p className="muted mt-1">Shoot schedule and crew</p>
      </div>
      <div className="glass glass-pad">
        {error === 'link' && (
          <p role="alert" className="msg-error mb-4">
            That link has expired or was already used. Use &quot;Forgot password&quot; below to get a code, or ask the manager to invite you again.
          </p>
        )}
        <p className="muted mb-4">Log in with your email and password.</p>
        <LoginForm />
      </div>
    </main>
  )
}
