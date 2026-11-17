import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { getMe } from '@/lib/session'
import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getMe()
  if (user) redirect('/')
  const { error } = await searchParams
  return (
    <AuthShell title="Arabian Nights" subtitle="Shoot schedule and crew">
      {error === 'link' && (
        <p role="alert" className="msg-error mb-4">
          That link has expired or was already used. Use &quot;Forgot password&quot; below to get a code, or ask the manager to invite you again.
        </p>
      )}
      <p className="muted mb-4">Log in with your email and password.</p>
      <LoginForm />
    </AuthShell>
  )
}
