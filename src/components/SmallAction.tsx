import type { ActionState } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'

/** A one-button form with hidden fields (remove, mark paid, accept…). */
export function SmallAction({
  action,
  fields,
  label,
  variant = 'secondary',
  small = true,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  fields: Record<string, string>
  label: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  small?: boolean
}) {
  return (
    <ActionForm action={action} className="inline-block">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} small={small}>
        {label}
      </SubmitButton>
    </ActionForm>
  )
}
