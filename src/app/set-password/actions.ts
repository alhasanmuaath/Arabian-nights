'use server'

import { redirect } from 'next/navigation'
import { checkPassword, passwordError } from '@/lib/password'
import { getMe } from '@/lib/session'

export type PasswordState = { error?: string } | null

/** For someone who is logged in: the invitation link, or "change my password". */
export async function setPassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const { supabase, user } = await getMe()
  if (!user) redirect('/login')

  const password = String(fd.get('password') ?? '')
  const bad = checkPassword(password, String(fd.get('confirm') ?? ''))
  if (bad) return { error: bad }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: passwordError(error.message) }
  redirect('/')
}
