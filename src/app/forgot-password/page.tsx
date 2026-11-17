import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { getMe } from '@/lib/session'
import { ForgotForm } from './ForgotForm'

export default async function ForgotPasswordPage() {
  const { user } = await getMe()
  if (user) redirect('/')
  return (
    <AuthShell title="Set your password" subtitle="For a forgotten password, or your first time here">
      <ForgotForm />
    </AuthShell>
  )
}
