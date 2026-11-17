import 'server-only'
import { resolveTxt } from 'node:dns/promises'
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

/** What the app was given (never the password), for the manager's "Email check". */
export function mailSettings() {
  return {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER ?? '',
    from: process.env.SMTP_FROM ?? '',
    passwordSet: Boolean(process.env.SMTP_PASS),
  }
}

export function mailSettingsText() {
  const m = mailSettings()
  return `host ${m.host || '(missing)'}, port ${m.port}, user ${m.user || '(none)'}, from ${m.from || '(missing)'}, password ${m.user ? (m.passwordSet ? 'set' : 'MISSING') : 'not used'}`
}

/** The reason a message could not be sent, in words a person can act on. */
export function describeMailError(e: unknown): string {
  if (!(e instanceof Error)) return 'unknown error'
  const err = e as Error & { code?: string; response?: string }
  const text = [err.code, err.response || err.message].filter(Boolean).join(': ')
  return text.replace(/\s+/g, ' ').slice(0, 300)
}

/** Does the sending domain have the records that stop mail landing in spam? */
export async function mailDnsCheck(domain: string) {
  const txt = async (name: string) => {
    try {
      return (await resolveTxt(name)).map((r) => r.join(''))
    } catch {
      return []
    }
  }
  const [root, dkim, dmarc] = await Promise.all([txt(domain), txt(`privateemail._domainkey.${domain}`), txt(`_dmarc.${domain}`)])
  return {
    spf: root.some((t) => t.startsWith('v=spf1')),
    spfPrivate: root.some((t) => /spf\.privateemail\.com/.test(t)),
    dkim: dkim.some((t) => t.includes('v=DKIM1')),
    dmarc: dmarc.some((t) => t.startsWith('v=DMARC1')),
  }
}
