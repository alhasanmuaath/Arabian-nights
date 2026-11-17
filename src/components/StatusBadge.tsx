import type { CrewResponse, PayStatus, ShootStatus } from '@/lib/types'

type BadgeStatus = ShootStatus | PayStatus | CrewResponse

const STYLE: Record<BadgeStatus, { cls: string; label: string }> = {
  planned: { cls: 'chip-info', label: 'Planned' },
  completed: { cls: 'chip-ok', label: 'Completed' },
  cancelled: { cls: 'chip-no', label: 'Cancelled' },
  paid: { cls: 'chip-ok', label: 'Paid' },
  not_paid: { cls: 'chip-wait', label: 'Not paid' },
  pending: { cls: 'chip-wait', label: 'No answer yet' },
  accepted: { cls: 'chip-ok', label: 'Accepted' },
  declined: { cls: 'chip-no', label: 'Declined' },
}

export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const s = STYLE[status]
  return (
    <span className={`chip ${s.cls}`}>
      <span className="dot" aria-hidden="true" />
      {label ?? s.label}
    </span>
  )
}
