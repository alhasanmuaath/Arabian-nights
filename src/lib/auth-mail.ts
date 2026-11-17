import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { inviteEmail, recoveryEmail } from './emails'
import { mailConfigured, sendMail } from './mail'
import { createAdminClient } from './supabase/admin'
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './supabase/env'

export type SendResult = 'sent' | 'too-soon' | 'unknown' | 'error'

/** One reset code per person per minute, so the page cannot be used to flood an inbox. */
const MIN_SECONDS_BETWEEN_CODES = 60

/**
 * Emails the 6-digit "Forgot password" code.
 * With SMTP settings the app sends it itself; without them Supabase does.
 */
export async function sendResetCode(email: string): Promise<SendResult> {
  const admin = createAdminClient()

  if (!admin || !mailConfigured()) {
    // Fallback: Supabase sends it using the "Reset password" template in the dashboard.
    const mailer = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await mailer.auth.resetPasswordForEmail(email)
    if (!error) return 'sent'
    return error.status === 429 || /security purposes|rate limit/i.test(error.message) ? 'too-soon' : 'error'
  }

  const { data: person } = await admin.from('people').select('user_id').eq('email', email).maybeSingle()
  if (!person?.user_id) return 'unknown' // not on the team: say nothing

  const { data: existing } = await admin.auth.admin.getUserById(person.user_id)
  const lastSent = existing?.user?.recovery_sent_at ? Date.parse(existing.user.recovery_sent_at) : 0
  if (Date.now() - lastSent < MIN_SECONDS_BETWEEN_CODES * 1000) return 'too-soon'

  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const code = data?.properties?.email_otp
  if (error || !code) return 'error'

  try {
    await sendMail(email, recoveryEmail(code))
  } catch (e) {
    console.error('Reset code email failed:', e instanceof Error ? e.message : e)
    return 'error'
  }
  return 'sent'
}

/**
 * Emails an invitation with a link to choose a password. Returns a sentence
 * for the manager. Someone who already has an account gets a reset code.
 */
export async function sendInvitation(email: string, origin: string): Promise<string> {
  const admin = createAdminClient()
  if (!admin) return ' (No secret key set, so no invitation email was sent.)'

  const existingAccount = async () => {
    const r = await sendResetCode(email)
    if (r === 'sent' || r === 'too-soon') {
      return ' They already have an account, so we sent a 6-digit code. They enter it on the "Forgot password" page to choose a password.'
    }
    return ' They already have an account. Ask them to use "Forgot password" on the login page.'
  }

  if (!mailConfigured()) {
    // Fallback: Supabase sends it using the "Invite user" template in the dashboard.
    const { error } = await admin.auth.admin.inviteUserByEmail(email)
    if (!error) return ' Invitation email sent. It has a link where they choose their password.'
    if (/already|registered|exists/i.test(error.message)) return existingAccount()
    return ` Invitation failed: ${error.message}`
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email })
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return existingAccount()
    return ` Invitation failed: ${error.message}`
  }
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`
  try {
    await sendMail(email, inviteEmail(link))
  } catch (e) {
    console.error('Invitation email failed:', e instanceof Error ? e.message : e)
    return ' The person was added, but the invitation email could not be sent. Try "Resend invitation" in a minute.'
  }
  return ' Invitation email sent. It has a link where they choose their password.'
}
