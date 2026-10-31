import { redirect } from 'next/navigation'
import { getMe } from '@/lib/session'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const { user } = await getMe()
  if (user) redirect('/')
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-1">Shoot Scheduler</h1>
      <p className="muted mb-6">Log in with the email address the manager invited.</p>
      <div className="card">
        <LoginForm />
      </div>
    </main>
  )
}
