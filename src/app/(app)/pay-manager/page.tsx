import Link from 'next/link'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, money } from '@/lib/dates'
import { ROLE_LABEL, getTargets, requireRole } from '@/lib/session'
import type { Pay, Person, ShootDay } from '@/lib/types'
import { updateDayRate, updatePay } from '../actions'

type Row = Pay & {
  shoot_days: Pick<ShootDay, 'date' | 'hours' | 'title'> | null
  people: Pick<Person, 'name' | 'role'> | null
}

export default async function PayManager() {
  const { supabase } = await requireRole('manager')
  const targets = await getTargets()
  const cur = targets.currency

  const { data, error } = await supabase.from('pay').select('*, shoot_days(date, hours, title), people(name, role)')
  if (error) {
    return (
      <section className="glass glass-pad">
        <h1>Pay</h1>
        <p role="alert" className="msg-error mt-2">
          Could not load payment records: {error.message}
        </p>
      </section>
    )
  }

  const rows = ((data ?? []) as Row[]).sort((a, b) => (b.shoot_days?.date ?? '').localeCompare(a.shoot_days?.date ?? ''))

  const perPerson = new Map<string, { name: string; role: Person['role']; days: number; total: number; paid: number }>()
  for (const r of rows) {
    const e = perPerson.get(r.person_id) ?? { name: r.people?.name ?? '—', role: r.people?.role ?? 'model', days: 0, total: 0, paid: 0 }
    e.days += 1
    e.total += Number(r.amount)
    if (r.status === 'paid') e.paid += Number(r.amount)
    perPerson.set(r.person_id, e)
  }
  const grand = rows.reduce((t, r) => t + Number(r.amount), 0)
  const grandPaid = rows.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0)
  const owed = [...perPerson.values()].sort((a, b) => b.total - b.paid - (a.total - a.paid))

  return (
    <>
      <header>
        <p className="eyebrow">Only you can see this page</p>
        <h1 className="mt-1">Pay</h1>
      </header>

      <section className="glass glass-hero glass-pad" data-tilt>
        <p className="faint">Still to pay</p>
        <p className="num text-4xl font-bold tracking-tight">{money(grand - grandPaid, cur)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="row">
            <p className="faint">Total</p>
            <p className="num text-lg font-semibold">{money(grand, cur)}</p>
          </div>
          <div className="row">
            <p className="faint">Paid</p>
            <p className="num text-lg font-semibold text-ok">{money(grandPaid, cur)}</p>
          </div>
        </div>
      </section>

      <section className="glass glass-pad">
        <h2 className="mb-1">Model day rate</h2>
        <p className="muted mb-4">
          Every model who attends a completed shoot day gets this amount. Photographers and organizers are paid only when you set an agreed fee on the shoot day.
        </p>
        <ActionForm action={updateDayRate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="day_rate">Amount per completed day</label>
              <input id="day_rate" name="day_rate" type="number" min={0} step="0.01" defaultValue={targets.day_rate} required />
            </div>
            <div>
              <label htmlFor="currency">Currency</label>
              <input id="currency" name="currency" defaultValue={cur} maxLength={6} required />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-[15px] font-normal text-ink">
            <input type="checkbox" name="apply_unpaid" />
            Also update unpaid model payments
          </label>
          <SubmitButton>Save day rate</SubmitButton>
        </ActionForm>
      </section>

      <section className="glass glass-pad">
        <h2 className="mb-3">By person</h2>
        {owed.length === 0 ? (
          <p className="muted">Nothing yet. Payments appear when a shoot day is marked completed.</p>
        ) : (
          <ul className="space-y-2.5">
            {owed.map((e) => (
              <li key={e.name + e.role} className="row flex items-center gap-3">
                <Avatar name={e.name} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="faint">
                    {ROLE_LABEL[e.role]} · {e.days} {e.days === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`num font-semibold ${e.total - e.paid > 0 ? 'text-wait' : 'text-ok'}`}>{money(e.total - e.paid, cur)}</p>
                  <p className="faint num">of {money(e.total, cur)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass glass-pad">
        <h2 className="mb-3">Every payment</h2>
        {rows.length === 0 && <p className="muted">No completed shoot days yet.</p>}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="row space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <strong>{r.shoot_days ? fmtDate(r.shoot_days.date) : '—'}</strong>
                  <span className="text-ink-2"> · {r.people?.name ?? 'Unknown'}</span>
                  <span className="faint"> · {r.people ? ROLE_LABEL[r.people.role] : ''}</span>
                </p>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm action={updatePay} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <div>
                    <label htmlFor={`amt-${r.id}`}>Amount ({cur})</label>
                    <input id={`amt-${r.id}`} name="amount" type="number" min={0} step="0.01" defaultValue={r.amount} className="w-32" />
                  </div>
                  <SubmitButton variant="secondary" small>
                    Save
                  </SubmitButton>
                </ActionForm>
                {r.status === 'paid' ? (
                  <SmallAction action={updatePay} fields={{ id: r.id, status: 'not_paid' }} label="Mark not paid" />
                ) : (
                  <SmallAction
                    action={updatePay}
                    fields={{ id: r.id, status: 'paid' }}
                    variant="primary"
                    label={
                      <>
                        <Icon name="check" size={14} /> Mark paid
                      </>
                    }
                  />
                )}
                {r.shoot_days && (
                  <Link href={`/shoots?date=${r.shoot_days.date}`} className="link ml-auto text-sm">
                    View shoot day
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
