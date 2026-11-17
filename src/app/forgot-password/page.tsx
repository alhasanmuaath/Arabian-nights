import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { getMe } from '@/lib/session'
import { ForgotForm } from './ForgotForm'

// Sending the code can take a few seconds; allow for a slow mail server.
export const maxDuration = 30

export default async function ForgotPasswordPage() {
  const { user } = await getMe()
  if (user) redirect('/')
  return (
    <AuthShell title="Set your password" subtitle="For a forgotten password, or your first time here">
      <ForgotForm />
    </AuthShell>
  )
}
