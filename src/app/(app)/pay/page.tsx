import { Icon } from '@/components/Icon'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, money } from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Pay, ShootDay } from '@/lib/types'

type Row = Pay & { shoot_days: Pick<ShootDay, 'date' | 'title' | 'hours'> | null }

export default async function MyPay() {
  const { supabase, me } = await requireRole()
  const targets = await getTargets()
  const { data } = await supabase
    .from('pay')
    .select('*, shoot_days(date, title, hours)')
    .eq('person_id', me.id)
  const rows = ((data ?? []) as Row[]).sort((a, b) => (b.shoot_days?.date ?? '').localeCompare(a.shoot_days?.date ?? ''))
  const cur = targets.currency
  const total = rows.reduce((t, r) => t + Number(r.amount), 0)
  const paid = rows.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0)

  return (
    <>
      <header>
        <p className="eyebrow">Only you and the manager can see this</p>
        <h1 className="mt-1">My pay</h1>
      </header>

      <section className="glass glass-hero glass-pad">
        <p className="faint">Total earned</p>
        <p className="num text-4xl font-bold tracking-tight">{money(total, cur)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="row">
            <p className="faint">Paid</p>
            <p className="num text-lg font-semibold text-ok">{money(paid, cur)}</p>
          </div>
          <div className="row">
            <p className="faint">Still to be paid</p>
            <p className="num text-lg font-semibold text-wait">{money(total - paid, cur)}</p>
          </div>
        </div>
      </section>

      <section className="glass glass-pad">
        <h2 className="mb-3">Completed shoot days</h2>
        {rows.length === 0 ? (
          <div className="py-4 text-center">
            <Icon name="wallet" size={28} className="mx-auto text-ink-3" />
            <p className="muted mt-2">Pay appears here after a shoot day you attended is marked completed.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.id} className="row flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.shoot_days ? fmtDate(r.shoot_days.date) : '—'}</p>
                  <p className="faint truncate">{r.shoot_days?.title || 'Shoot day'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num font-semibold">{money(r.amount, cur)}</span>
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
