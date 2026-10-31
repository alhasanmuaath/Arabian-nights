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
      <form action={emailAction} className="space-y-3">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        </div>
        {emailState.error && <p role="alert" className="text-sm text-red-700">{emailState.error}</p>}
        <button className="btn w-full border-gray-900 bg-gray-900 text-white" disabled={sending}>
          {sending ? 'Sending…' : 'Send login code'}
        </button>
      </form>
    )
  }

  return (
    <form action={codeAction} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <p className="text-sm text-gray-700">{emailState.info}</p>
      <div>
        <label htmlFor="code">6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required autoFocus />
      </div>
      {codeState.error && <p role="alert" className="text-sm text-red-700">{codeState.error}</p>}
      <button className="btn w-full border-gray-900 bg-gray-900 text-white" disabled={verifying}>
        {verifying ? 'Checking…' : 'Log in'}
      </button>
      <p className="text-xs text-gray-600">You can also tap the link in the email instead of typing the code.</p>
    </form>
  )
}
