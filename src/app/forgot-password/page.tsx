import { redirect } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { getMe } from '@/lib/session'
import { ForgotForm } from './ForgotForm'

export default async function ForgotPasswordPage() {
  const { user } = await getMe()
  if (user) redirect('/')
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="glass mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <Icon name="moon" size={28} className="text-gold-300" />
        </span>
        <h1 className="text-[1.75rem]">Set your password</h1>
        <p className="muted mt-1">For a forgotten password, or your first time here</p>
      </div>
      <div className="glass glass-pad">
        <ForgotForm />
      </div>
    </main>
  )
}
