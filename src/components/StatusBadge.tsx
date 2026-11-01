
import type { AvailabilityStatus, PayStatus, ShootStatus } from '@/lib/types'

type BadgeStatus = ShootStatus | PayStatus | AvailabilityStatus

const styles: Record<BadgeStatus, string> = {
  free: 'border-gray-300 text-gray-700',
  offered: 'border-amber-500 text-amber-800',
  confirmed: 'border-blue-600 text-blue-800',
  completed: 'border-green-700 text-green-800',
  paid: 'border-green-700 text-green-800',
  not_paid: 'border-red-400 text-red-800',
  pending: 'border-amber-500 text-amber-800',
  approved: 'border-green-700 text-green-800',
  rejected: 'border-red-400 text-red-800',
}

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'not_paid' ? 'not paid' : status}
    </span>
  )
}

