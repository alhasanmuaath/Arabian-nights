import type { PayStatus, ShootStatus } from '@/lib/types'

const styles: Record<ShootStatus | PayStatus, string> = {
  free: 'border-gray-300 text-gray-700',
  offered: 'border-amber-500 text-amber-800',
  confirmed: 'border-blue-600 text-blue-800',
  completed: 'border-green-700 text-green-800',
  paid: 'border-green-700 text-green-800',
  not_paid: 'border-red-400 text-red-800',
}

export function StatusBadge({ status }: { status: ShootStatus | PayStatus }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'not_paid' ? 'not paid' : status}
    </span>
  )
}
