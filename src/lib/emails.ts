import type { Email } from './mail'

const shell = (inner: string) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f1fb;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#17153a">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e3def7">
    <p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b27a0e">Arabian Nights</p>
    ${inner}
  </div>
</body></html>`

/** The 6-digit code for "Forgot password". No link, on purpose. */
export function recoveryEmail(code: string): Email {
  return {
    subject: 'Arabian Nights: your password reset code',
    html: shell(`
    <h2 style="margin:0 0 12px;font-size:20px">Your password reset code</h2>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.5">Enter this code on the Forgot password page, together with your new password:</p>
    <p style="margin:0 0 18px;font-size:34px;font-weight:800;letter-spacing:8px;color:#17153a">${code}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#4b4870">The code works once and expires soon.</p>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#4b4870">If you did not ask for this, ignore this email. Your password stays the same.</p>`),
    text: `Arabian Nights\n\nYour password reset code: ${code}\n\nEnter it on the Forgot password page, together with your new password. The code works once and expires soon.\n\nIf you did not ask for this, ignore this email. Your password stays the same.\n`,
  }
}

/** A link that opens the page where a new person chooses their password. */
export function inviteEmail(link: string): Email {
  return {
    subject: 'Welcome to Arabian Nights: choose your password',
    html: shell(`
    <h2 style="margin:0 0 12px;font-size:20px">Welcome to the team</h2>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.5">The manager added you to Arabian Nights. Tap the button to choose your password. You will use it, with this email address, to log in.</p>
    <p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;padding:13px 24px;background:#f4c462;color:#23180a;border-radius:999px;font-weight:700;text-decoration:none">Choose my password</a></p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#4b4870">The link works once and stops working after a while, so use it soon. If it has expired, open the app, tap <strong>Forgot password</strong> and enter this email address to get a 6-digit code.</p>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#4b4870">If you did not expect this email, ignore it.</p>`),
    text: `Welcome to Arabian Nights\n\nThe manager added you to the team. Open this link to choose your password:\n${link}\n\nThe link works once and stops working after a while. If it has expired, open the app, tap "Forgot password" and enter this email address to get a 6-digit code.\n\nIf you did not expect this email, ignore it.\n`,
  }
}

/** Sent by the manager's "Email check" to prove the mailbox works. */
export function testEmail(): Email {
  return {
    subject: 'Arabian Nights: email test',
    html: shell(`
    <h2 style="margin:0 0 12px;font-size:20px">The email setup works</h2>
    <p style="margin:0;font-size:15px;line-height:1.5">If you can read this, Arabian Nights can send password reset codes and invitations.</p>`),
    text: 'Arabian Nights\n\nThe email setup works. If you can read this, Arabian Nights can send password reset codes and invitations.\n',
  }
}
