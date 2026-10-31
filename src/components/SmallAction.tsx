import type { ActionState } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'

/** A one-button form with hidden fields (delete, mark paid, accept…). */
export function SmallAction({
  action,
  fields,
  label,
  variant = 'secondary',
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  fields: Record<string, string>
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  return (
    <ActionForm action={action} className="inline-block">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  )
}
