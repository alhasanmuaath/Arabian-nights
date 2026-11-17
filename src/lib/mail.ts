import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Sends the login emails (password reset code, invitation) from the app
 * itself, through your own mailbox, so they always look the same and do not
 * depend on the email templates saved in the Supabase dashboard.
 *
 * Needs SMTP_HOST and SMTP_FROM, plus SMTP_USER / SMTP_PASS / SMTP_PORT for a
 * real mail server. Without them the app falls back to Supabase's own emails.
 */
export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

let transport: Transporter | null = null

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465)
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return transport
}

export type Email = { subject: string; html: string; text: string }

export async function sendMail(to: string, email: Email) {
  await getTransport().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  })
}
