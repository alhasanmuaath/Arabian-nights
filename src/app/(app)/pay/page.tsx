import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, money } from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Pay, ShootDay } from '@/lib/types'

type Row = Pay & { shoot_days: Pick<ShootDay, 'date' | 'hours' | 'videos_planned'> | null }

export default async function MyPay() {
  const { supabase, me } = await requireRole('model')
  const targets = await getTargets()
  const { data } = await supabase
    .from('pay')
    .select('*, shoot_days(date, hours, videos_planned)')
    .eq('person_id', me.id)
  const rows = ((data ?? []) as Row[]).sort((a, b) => (a.shoot_days?.date ?? '').localeCompare(b.shoot_days?.date ?? ''))
  const cur = targets.currency
  const total = rows.reduce((t, r) => t + Number(r.amount), 0)
  const paid = rows.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0)

  return (
    <>
      <div>
        <h1>My pay</h1>
        <p className="muted">
          Paid per completed shoot day (4 hours). Current rate: {money(targets.day_rate, cur)} per day.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs text-gray-600">Total earned</p>
          <p className="text-lg font-semibold tabular-nums">{money(total, cur)}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-gray-600">Paid</p>
          <p className="text-lg font-semibold tabular-nums">{money(paid, cur)}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-gray-600">Not paid yet</p>
          <p className="text-lg font-semibold tabular-nums">{money(total - paid, cur)}</p>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2">Completed days</h2>
        {rows.length === 0 ? (
          <p className="muted">No completed shoot days yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.shoot_days ? fmtDate(r.shoot_days.date) : '—'}</td>
                  <td className="tabular-nums">{money(r.amount, cur)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
