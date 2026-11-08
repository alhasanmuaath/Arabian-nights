
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, money } from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Pay, Person, ShootDay } from '@/lib/types'
import { updateDayRate, updatePay } from '../actions'

type Row = Pay & {
  shoot_days: Pick<ShootDay, 'date' | 'hours'> | null
  people: Pick<Person, 'name' | 'role'> | null
}

export default async function PayManager() {
  const { supabase } = await requireRole('manager')
  const targets = await getTargets()
  const cur = targets.currency

  const { data, error } = await supabase
    .from('pay')
    .select('*, shoot_days(date, hours), people(name, role)')

  if (error) {
    return (
      <section className="card">
        <h1>Pay manager</h1>
        <p className="text-red-600">
          Could not load payment records: {error.message}
        </p>
      </section>
    )
  }

  const rows = ((data ?? []) as Row[]).sort((a, b) =>
    (b.shoot_days?.date ?? '').localeCompare(a.shoot_days?.date ?? '')
  )

  const perPerson = new Map<
    string,
    {
      name: string
      role: string
      days: number
      total: number
      paid: number
    }
  >()

  for (const r of rows) {
    const key = r.person_id
    const e = perPerson.get(key) ?? {
      name: r.people?.name ?? '—',
      role: r.people?.role ?? 'unknown',
      days: 0,
      total: 0,
      paid: 0,
    }

    e.days += 1
    e.total += Number(r.amount)

    if (r.status === 'paid') {
      e.paid += Number(r.amount)
    }

    perPerson.set(key, e)
  }

  const grand = rows.reduce((total, r) => total + Number(r.amount), 0)

  const grandPaid = rows
    .filter((r) => r.status === 'paid')
    .reduce((total, r) => total + Number(r.amount), 0)

  return (
    <>
      <div>
        <h1>Pay manager</h1>
        <p className="muted">
          Model payments use the global day rate. Photographer payments are
          agreed separately for each shoot.
        </p>
      </div>

      <section className="card">
        <h2 className="mb-2">Model day rate</h2>

        <ActionForm action={updateDayRate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="day_rate">
                Amount per completed day (4 h)
              </label>
              <input
                id="day_rate"
                name="day_rate"
                type="number"
                min={0}
                step="0.01"
                defaultValue={targets.day_rate}
                required
              />
            </div>

            <div>
              <label htmlFor="currency">Currency</label>
              <input
                id="currency"
                name="currency"
                defaultValue={cur}
                maxLength={6}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 font-normal">
            <input type="checkbox" name="apply_unpaid" />
            Also update unpaid model payments
          </label>

          <SubmitButton>Save model day rate</SubmitButton>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-2">Payment totals</h2>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Shoots</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Owed</th>
              </tr>
            </thead>

            <tbody>
              {[...perPerson.entries()].map(([id, e]) => (
                <tr key={id}>
                  <td>{e.name}</td>
                  <td className="capitalize">{e.role}</td>
                  <td>{e.days}</td>
                  <td className="tabular-nums">
                    {money(e.total, cur)}
                  </td>
                  <td className="tabular-nums">
                    {money(e.paid, cur)}
                  </td>
                  <td className="tabular-nums">
                    {money(e.total - e.paid, cur)}
                  </td>
                </tr>
              ))}

              <tr className="font-semibold">
                <td>All</td>
                <td>—</td>
                <td>{rows.length}</td>
                <td className="tabular-nums">
                  {money(grand, cur)}
                </td>
                <td className="tabular-nums">
                  {money(grandPaid, cur)}
                </td>
                <td className="tabular-nums">
                  {money(grand - grandPaid, cur)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2">Completed shoots and payments</h2>

        {rows.length === 0 && (
          <p className="muted">No completed shoot payments yet.</p>
        )}

        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>
                    {r.shoot_days
                      ? fmtDate(r.shoot_days.date)
                      : '—'}
                  </strong>
                  {' · '}
                  {r.people?.name ?? 'Unknown person'}
                  {' · '}
                  <span className="capitalize">
                    {r.people?.role ?? 'Unknown role'}
                  </span>
                </span>

                <StatusBadge status={r.status} />
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <ActionForm
                  action={updatePay}
                  className="flex items-end gap-2"
                >
                  <input
                    type="hidden"
                    name="id"
                    value={r.id}
                  />

                  <div>
                    <label
                      htmlFor={`amt-${r.id}`}
                      className="text-xs"
                    >
                      Agreed amount ({cur})
                    </label>

                    <input
                      id={`amt-${r.id}`}
                      name="amount"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={r.amount}
                      className="w-32"
                    />
                  </div>

                  <SubmitButton variant="secondary">
                    Save amount
                  </SubmitButton>
                </ActionForm>

                {r.status === 'paid' ? (
                  <SmallAction
                    action={updatePay}
                    fields={{
                      id: r.id,
                      status: 'not_paid',
                    }}
                    label="Mark not paid"
                  />
                ) : (
                  <SmallAction
                    action={updatePay}
                    fields={{
                      id: r.id,
                      status: 'paid',
                    }}
                    label="Mark paid"
                    variant="primary"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
