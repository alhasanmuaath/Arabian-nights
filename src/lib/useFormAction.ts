'use client'

import { startTransition, useActionState, type FormEvent } from 'react'

/**
 * Runs a server action from a form WITHOUT React's automatic form reset.
 * With a plain `<form action={…}>` React clears the fields after every submit,
 * so a mistyped password would also wipe the email next to it.
 * Use: const { state, pending, onSubmit } = useFormAction(action, initial)
 *      <form onSubmit={onSubmit}> … </form>
 */
export function useFormAction<S>(action: (prev: S, fd: FormData) => Promise<S>, initial: S) {
  // React's own typing cannot express "the state type is not a promise" for a generic S.
  const [state, formAction, pending] = useActionState(action as never, initial as never) as unknown as [
    S,
    (fd: FormData) => void,
    boolean,
  ]
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    const data = new FormData(e.currentTarget, submitter)
    startTransition(() => formAction(data))
  }
  return { state, pending, onSubmit }
}
