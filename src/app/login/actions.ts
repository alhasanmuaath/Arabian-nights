'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { step: 'email' | 'code'; email?: string; error?: string; info?: string }

export async function sendCode(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get('email') || '').trim().toLowerCase()
  if (!email.includes('@')) return { step: 'email', error: 'Enter a valid email address.' }
  const supabase = await createClient()
  const h = await headers()
  const origin = h.get('origin') || `https://${h.get('host')}`
  const send = () =>
    supabase.auth.signInWithOtp({
      email,
      // Never let strangers create a login here (sign-ups are off).
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
    })

  let { error } = await send()
  if (error && /signups not allowed|not found/i.test(error.message) && (await ensureLoginForTeamMember(email))) {
    // They're on the team list but had no (confirmed) login yet; it exists now.
    ;({ error } = await send())
  }
  if (error && (error.status === 429 || /security purposes|rate limit/i.test(error.message))) {
    // A code was sent very recently (e.g. the invite email). Let them use it.
    return { step: 'code', email, info: `We sent a code to ${email} a moment ago. Check your email (and spam folder).` }
  }
  if (error) {
    const notInvited = /signups not allowed|not found|user not found/i.test(error.message)
    return {
      step: 'email',
      email,
      error: notInvited ? 'This email has not been invited yet. Ask the manager to invite you.' : error.message,
    }
  }
  return { step: 'code', email, info: `We sent a 6-digit code to ${email}.` }
}

export async function verifyCode(prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get('email') || prev.email || '').trim().toLowerCase()
  const token = String(fd.get('code') || '').replace(/\s/g, '')
  if (fd.get('back')) return { step: 'email', email }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) return { step: 'code', email, error: 'That code is wrong or has expired. Try again or request a new one.' }
  redirect('/')
}

/**
 * If this email is on the team list (people table) but has no usable login yet,
 * e.g. the first manager added by SQL, or an invite email that never arrived,
 * create or confirm the login. Emails not on the team list are left alone.
 */
async function ensureLoginForTeamMember(email: string): Promise<boolean> {
  const admin = createAdminClient()
  if (!admin) return false
  const { data: person } = await admin.from('people').select('user_id').eq('email', email).maybeSingle()
  if (!person) return false
  if (person.user_id) {
    const { error } = await admin.auth.admin.updateUserById(person.user_id, { email_confirm: true })
    return !error
  }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  return !error
}
