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
        <p role="alert" className="mt-2 w-full text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-2 w-full text-sm text-green-800">
          {state.ok}
        </p>
      )}
    </form>
  )
}

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const { pending } = useFormStatus()
  const styles = {
    primary: 'bg-gray-900 text-white border-gray-900',
    secondary: 'bg-white text-gray-900 border-gray-300',
    danger: 'bg-white text-red-700 border-red-300',
  }[variant]
  return (
    <button type="submit" disabled={pending} className={`btn ${styles} disabled:opacity-50`}>
      {pending ? 'Saving…' : children}
    </button>
  )
}
