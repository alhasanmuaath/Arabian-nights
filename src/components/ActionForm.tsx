'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import type { ActionState } from '@/lib/types'

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
}

/** A <form> that runs a server action and shows its success / error message. */
export function ActionForm({ action, children, className, resetOnSuccess }: Props) {
  const [state, formAction] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset()
  }, [state, resetOnSuccess])
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="msg-error mt-2 w-full">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="msg-ok mt-2 w-full">
          {state.ok}
        </p>
      )}
    </form>
  )
}

export function SubmitButton({
  children,
  variant = 'primary',
  small,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  small?: boolean
}) {
  const { pending } = useFormStatus()
  const styles = { primary: 'btn-primary', secondary: '', danger: 'btn-danger' }[variant]
  return (
    <button type="submit" disabled={pending} className={`btn ${styles} ${small ? 'btn-sm' : ''}`}>
      {pending ? 'Saving…' : children}
    </button>
  )
}
