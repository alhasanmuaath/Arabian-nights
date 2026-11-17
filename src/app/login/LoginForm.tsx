'use client'

import { useActionState } from 'react'
import { sendCode, verifyCode, type LoginState } from './actions'

export function LoginForm() {
  const [emailState, emailAction, sending] = useActionState(sendCode, { step: 'email' } as LoginState)
  const [codeState, codeAction, verifying] = useActionState(verifyCode, { step: 'code' } as LoginState)

  const onCodeStep = emailState.step === 'code' && codeState.step !== 'email'
  const email = emailState.email || ''

  if (!onCodeStep) {
    return (
      <form action={emailAction} className="space-y-4">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={email} />
        </div>
        {emailState.error && (
          <p role="alert" className="msg-error">
            {emailState.error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={sending}>
          {sending ? 'Sending…' : 'Send login code'}
        </button>
      </form>
    )
  }

  return (
    <form action={codeAction} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <p className="muted">{emailState.info}</p>
      <div>
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,8}"
          required
          autoFocus
          className="num text-center text-2xl tracking-[0.4em]"
        />
      </div>
      {codeState.error && (
        <p role="alert" className="msg-error">
          {codeState.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={verifying}>
        {verifying ? 'Checking…' : 'Log in'}
      </button>
      <p className="faint">You can also tap the link in the email instead of typing the code.</p>
    </form>
  )
}
