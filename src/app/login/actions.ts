'use server'

import { redirect } from 'next/navigation'
import { sendResetCode } from '@/lib/auth-mail'
import { checkPassword, passwordError } from '@/lib/password'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const clean = (v: FormDataEntryValue | null) => String(v ?? '').trim()

// ---------------------------------------------------------------------
// Log in with email + password
// ---------------------------------------------------------------------
export type LoginState = { error?: string } | null

export async function signIn(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = clean(fd.get('email')).toLowerCase()
  const password = String(fd.get('password') ?? '')
  if (!email.includes('@') || !password) return { error: 'Enter your email and password.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      return { error: 'Too many attempts. Wait a few minutes and try again.' }
    }
    // Same message for a wrong password and an unknown email, on purpose.
    return { error: 'Wrong email or password. No password yet? Use "Forgot password" to set one.' }
  }
  redirect('/')
}

// ---------------------------------------------------------------------
// Forgot password: email a 6-digit code, then set a new password
// ---------------------------------------------------------------------
export type ResetState = { step: 'email' | 'code'; email?: string; error?: string; info?: string }

/**
 * Someone on the team list with no login yet (for example the first manager,
 * added by SQL) gets one created, so the reset code can reach them.
 * Emails that are not on the list are left alone.
 */
async function ensureLoginForTeamMember(email: string) {
  const admin = createAdminClient()
  if (!admin) return
  const { data: person } = await admin.from('people').select('user_id').eq('email', email).maybeSingle()
  if (!person || person.user_id) return
  await admin.auth.admin.createUser({ email, email_confirm: true })
}

/** One action for both steps of the page; `step` says which one was submitted. */
export async function forgotPassword(prev: ResetState, fd: FormData): Promise<ResetState> {
  const email = clean(fd.get('email')).toLowerCase() || prev.email || ''
  if (fd.get('back')) return { step: 'email', email }

  // ---- step 2: code + new password
  if (clean(fd.get('step')) === 'code') {
    const code = String(fd.get('code') ?? '').replace(/\s/g, '')
    const password = String(fd.get('password') ?? '')
    const bad = checkPassword(password, String(fd.get('confirm') ?? ''))
    if (bad) return { step: 'code', email, error: bad }

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
    if (error) return { step: 'code', email, error: 'That code is wrong or has expired. Go back and ask for a new one.' }

    // The code worked, so they are signed in now. Save the new password.
    const { error: saveError } = await supabase.auth.updateUser({ password })
    if (saveError) redirect(`/set-password?notice=${encodeURIComponent(passwordError(saveError.message))}`)
    redirect('/')
  }

  // ---- step 1: send the code
  if (!email.includes('@')) return { step: 'email', error: 'Enter a valid email address.' }
  await ensureLoginForTeamMember(email)

  const result = await sendResetCode(email)
  if (result === 'error') return { step: 'email', email, error: 'Could not send the code. Please try again in a minute.' }

  // Same answer whether or not the email is on the team: it does not reveal who is.
  return {
    step: 'code',
    email,
    info: `If ${email} is on the team, a 6-digit code is on its way. It can take a minute. Check spam too.`,
  }
}
