import { redirect } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { getMe } from '@/lib/session'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const { user } = await getMe()
  if (user) redirect('/')
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
        <p className="muted mb-4">Log in with the email address the manager invited. We will send you a 6-digit code.</p>
        <LoginForm />
      </div>
    </main>
  )
}
