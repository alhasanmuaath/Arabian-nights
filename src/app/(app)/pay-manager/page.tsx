import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, money } from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Pay, Person, ShootDay } from '@/lib/types'
import { updateDayRate, updatePay } from '../actions'

type Row = Pay & { shoot_days: Pick<ShootDay, 'date' | 'hours'> | null; people: Pick<Person, 'name'> | null }

export default async function PayManager() {
  const { supabase } = await requireRole('manager')
  const targets = await getTargets()
  const cur = targets.currency
  const { data } = await supabase.from('pay').select('*, shoot_days(date, hours), people(name)')
  const rows = ((data ?? []) as Row[]).sort((a, b) => (a.shoot_days?.date ?? '').localeCompare(b.shoot_days?.date ?? ''))

  const perPerson = new Map<string, { name: string; days: number; total: number; paid: number }>()
  for (const r of rows) {
    const e = perPerson.get(r.person_id) ?? { name: r.people?.name ?? '—', days: 0, total: 0, paid: 0 }
    e.days += 1
    e.total += Number(r.amount)
    if (r.status === 'paid') e.paid += Number(r.amount)
    perPerson.set(r.person_id, e)
  }
  const grand = rows.reduce((t, r) => t + Number(r.amount), 0)
  const grandPaid = rows.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0)

  return (
    <>
      <div>
        <h1>Pay manager</h1>
        <p className="muted">One pay line is created automatically when a shoot day is marked completed.</p>
      </div>

      <section className="card">
        <h2 className="mb-2">Day rate</h2>
        <ActionForm action={updateDayRate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="day_rate">Amount per completed day (6 h)</label>
              <input id="day_rate" name="day_rate" type="number" min={0} step="0.01" defaultValue={targets.day_rate} required />
            </div>
            <div>
              <label htmlFor="currency">Currency</label>
              <input id="currency" name="currency" defaultValue={cur} maxLength={6} required />
            </div>
          </div>
          <label className="flex items-center gap-2 font-normal">
            <input type="checkbox" name="apply_unpaid" /> Also update all days that are not paid yet
          </label>
          <SubmitButton>Save day rate</SubmitButton>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-2">Totals</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Days</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Owed</th>
            </tr>
          </thead>
          <tbody>
            {[...perPerson.values()].map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td>{e.days}</td>
                <td className="tabular-nums">{money(e.total, cur)}</td>
                <td className="tabular-nums">{money(e.paid, cur)}</td>
                <td className="tabular-nums">{money(e.total - e.paid, cur)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>All</td>
              <td>{rows.length}</td>
              <td className="tabular-nums">{money(grand, cur)}</td>
              <td className="tabular-nums">{money(grandPaid, cur)}</td>
              <td className="tabular-nums">{money(grand - grandPaid, cur)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="mb-2">Completed days</h2>
        {rows.length === 0 && <p className="muted">No completed shoot days yet.</p>}
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 py-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{r.shoot_days ? fmtDate(r.shoot_days.date) : '—'}</strong> · {r.people?.name}
                </span>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm action={updatePay} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <div>
                    <label htmlFor={`amt-${r.id}`} className="text-xs">
                      Amount ({cur})
                    </label>
                    <input id={`amt-${r.id}`} name="amount" type="number" min={0} step="0.01" defaultValue={r.amount} className="w-32" />
                  </div>
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
                {r.status === 'paid' ? (
                  <SmallAction action={updatePay} fields={{ id: r.id, status: 'not_paid' }} label="Mark not paid" />
                ) : (
                  <SmallAction action={updatePay} fields={{ id: r.id, status: 'paid' }} label="Mark paid" variant="primary" />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
