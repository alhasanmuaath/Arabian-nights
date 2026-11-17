import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { ShootRow } from '@/components/ShootBits'
import { ShootForm } from '@/components/ShootForm'
import { getTeam } from '@/lib/data'
import { cairoToday, dayNum, fmtDate, fmtDateShort, seasonDates, weekday } from '@/lib/dates'
import { canEditAll, getSupabase, getTargets, requireRole } from '@/lib/session'
import type { Attendee, ShootDay } from '@/lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOT: Record<ShootDay['status'], string> = {
  planned: 'bg-gold-400',
  completed: 'bg-ok',
  cancelled: 'bg-no',
}

export default async function Shoots({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await getSupabase()
  const today = cairoToday()
  const { date: picked } = await searchParams

  const [{ me }, targets, team, daysRes, crewRes] = await Promise.all([
    requireRole(),
    getTargets(),
    getTeam(supabase),
    supabase.from('shoot_days').select('*').order('date').order('start_time'),
    supabase.from('shoot_attendees').select('*'),
  ])
  const canEdit = canEditAll(me)
  const days = (daysRes.data ?? []) as ShootDay[]
  const attendees = (crewRes.data ?? []) as Attendee[]
  const dates = seasonDates(targets.season_start, targets.season_end)

  const byDate = new Map<string, ShootDay[]>()
  for (const d of days) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d])
  const myDays = new Set(attendees.filter((a) => a.person_id === me.id && a.response !== 'declined').map((a) => a.shoot_day_id))

  const upcoming = days.filter((d) => d.status === 'planned' && d.date >= today)
  const earlier = days.filter((d) => !(d.status === 'planned' && d.date >= today)).reverse()
  const people = [...team.values()].filter((p) => p.role !== 'manager')

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            {fmtDateShort(targets.season_start)} – {fmtDateShort(targets.season_end)} · Cairo time
          </p>
          <h1 className="mt-1">Shoot days</h1>
        </div>
        {canEdit && (
          <a href="#new" className="btn btn-primary">
            <Icon name="plus" size={16} /> New shoot day
          </a>
        )}
      </header>

      <section className="glass glass-pad">
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="faint pb-1 text-[11px] uppercase tracking-wide">
              {w}
            </div>
          ))}
          {Array.from({ length: weekday(dates[0]) }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {dates.map((d) => {
            const here = byDate.get(d) ?? []
            const mine = here.some((s) => myDays.has(s.id))
            const cls = `relative flex h-12 flex-col items-center justify-center rounded-xl border text-sm ${
              here.length ? 'border-white/16 bg-white/10 font-semibold' : 'border-transparent text-ink-3'
            } ${d === today ? 'ring-1 ring-gold-300/70' : ''} ${d === picked ? 'bg-white/20' : ''}`
            const inner = (
              <>
                <span className="num">{dayNum(d)}</span>
                {here.length > 0 && (
                  <span className="mt-0.5 flex gap-0.5">
                    {here.map((s) => (
                      <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${DOT[s.status]}`} />
                    ))}
                  </span>
                )}
                {mine && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-violet" title="You are on this day" />}
              </>
            )
            return here.length ? (
              <Link
                key={d}
                href={`/shoots/${here[0].id}`}
                transitionTypes={['drill-in']}
                aria-label={`${fmtDate(d)}: ${here.length} shoot day${here.length > 1 ? 's' : ''}${mine ? ', you are on the crew' : ''}`}
                className={`${cls} no-underline hover:bg-white/16`}
              >
                {inner}
              </Link>
            ) : (
              <div key={d} className={cls}>
                {inner}
              </div>
            )
          })}
        </div>
        <ul className="faint mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <li className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" /> Planned
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Completed
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" /> You&apos;re on it
          </li>
        </ul>
      </section>

      <section className="glass glass-pad">
        <h2 className="mb-3">Coming up ({upcoming.length})</h2>
        {upcoming.length ? (
          <div className="space-y-2.5">
            {upcoming.map((d) => (
              <ShootRow key={d.id} day={d} attendees={attendees} team={team} today={today} />
            ))}
          </div>
        ) : (
          <p className="muted">No shoot days planned yet.</p>
        )}
      </section>

      {earlier.length > 0 && (
        <section className="glass glass-pad">
          <h2 className="mb-3">Earlier ({earlier.length})</h2>
          <div className="space-y-2.5">
            {earlier.map((d) => (
              <ShootRow key={d.id} day={d} attendees={attendees} team={team} today={today} />
            ))}
          </div>
        </section>
      )}

      {canEdit && (
        <section id="new" className="glass glass-pad scroll-mt-24">
          <h2>New shoot day</h2>
          <p className="muted mb-4 mt-1">Pick the date and the crew. You can add photos of the place and scripts on the next screen.</p>
          <ShootForm dates={dates} people={people} defaultDate={dates.find((d) => d >= today)} />
        </section>
      )}
    </>
  )
}
