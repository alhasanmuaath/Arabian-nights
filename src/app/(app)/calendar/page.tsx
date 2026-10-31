import Link from 'next/link'
import { AvailabilityForm } from '@/components/AvailabilityForm'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { cairoToday, dayNum, fmtDate, fmtHours, fmtTime, seasonDates, weekday } from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Availability, ShootDay } from '@/lib/types'
import { deleteAvailability, respondToShootDay } from '../actions'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function MyCalendar({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, me } = await requireRole()
  const targets = await getTargets()
  const dates = seasonDates(targets.season_start, targets.season_end)
  const today = cairoToday()
  const { date: qDate } = await searchParams
  const selected = qDate && dates.includes(qDate) ? qDate : dates.includes(today) ? today : dates[0]

  const [{ data: avail }, { data: shoots }] = await Promise.all([
    supabase.from('availability').select('*').eq('person_id', me.id).order('date').order('start_time'),
    supabase.from('shoot_days').select('*').eq('person_id', me.id).order('date'),
  ])
  const windows = (avail ?? []) as Availability[]
  const myShoots = (shoots ?? []) as ShootDay[]

  const hoursByDate = new Map<string, number>()
  for (const w of windows) hoursByDate.set(w.date, (hoursByDate.get(w.date) ?? 0) + Number(w.hours))
  const shootByDate = new Map(myShoots.map((s) => [s.date, s]))
  const totalHours = windows.reduce((a, w) => a + Number(w.hours), 0)
  const offers = myShoots.filter((s) => s.status === 'offered')
  const upcoming = myShoots.filter((s) => s.status === 'confirmed' && s.date >= today)

  const dayWindows = windows.filter((w) => w.date === selected)
  const dayUsed = hoursByDate.get(selected) ?? 0
  const dayShoot = shootByDate.get(selected)

  const leading = weekday(dates[0])

  return (
    <>
      <div>
        <h1>My calendar</h1>
        <p className="muted">
          {fmtDate(targets.season_start)} – {fmtDate(targets.season_end)} · Cairo time · max 6 h per day
        </p>
        <p className="mt-1 text-sm">
          You&apos;ve offered <strong>{fmtHours(totalHours)}</strong> across <strong>{hoursByDate.size}</strong> days.
        </p>
      </div>

      {offers.length > 0 && (
        <section className="card space-y-3 border-amber-400">
          <h2>Shoot days waiting for your answer</h2>
          {offers.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <strong>{fmtDate(s.date)}</strong>
                {s.start_time && ` from ${fmtTime(s.start_time)}`} · {fmtHours(s.hours)} · {s.videos_planned} videos
              </div>
              <div className="flex gap-2">
                <SmallAction action={respondToShootDay} fields={{ id: s.id, accept: 'yes' }} label="Accept" variant="primary" />
                <SmallAction action={respondToShootDay} fields={{ id: s.id, accept: 'no' }} label="Decline" />
              </div>
            </div>
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card space-y-1">
          <h2>My confirmed shoot days</h2>
          {upcoming.map((s) => (
            <p key={s.id} className="text-sm">
              <strong>{fmtDate(s.date)}</strong>
              {s.start_time && ` from ${fmtTime(s.start_time)}`} · {fmtHours(s.hours)} · {s.videos_planned} videos{' '}
              <StatusBadge status={s.status} />
            </p>
          ))}
        </section>
      )}

      <section className="card">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-600">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {dates.map((d) => {
            const h = hoursByDate.get(d) ?? 0
            const shoot = shootByDate.get(d)
            const isSel = d === selected
            return (
              <Link
                key={d}
                href={`/calendar?date=${d}`}
                scroll={false}
                aria-label={`${fmtDate(d)}${h ? `, ${h} hours free` : ''}${shoot ? `, shoot ${shoot.status}` : ''}`}
                className={`flex h-14 flex-col items-center justify-center rounded border text-gray-900 ${
                  isSel ? 'border-2 border-gray-900' : 'border-gray-200'
                } ${h > 0 ? 'bg-gray-100' : 'bg-white'}`}
              >
                <span className={`text-sm ${d === today ? 'font-bold underline' : ''}`}>{dayNum(d)}</span>
                <span className="text-[11px] leading-tight">{h > 0 ? `${Math.round(h * 100) / 100}h` : ''}</span>
                {shoot && <span className="text-[10px] font-semibold uppercase leading-tight">shoot</span>}
              </Link>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-gray-600">Grey = you&apos;re free. &quot;shoot&quot; = a shoot day for you. Underlined = today.</p>
      </section>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2>{fmtDate(selected)}</h2>
          <span className="text-sm text-gray-700">
            {fmtHours(dayUsed)} of 6 h used
          </span>
        </div>
        {dayShoot && (
          <p className="text-sm">
            Shoot day: {dayShoot.start_time && `${fmtTime(dayShoot.start_time)} · `}
            {fmtHours(dayShoot.hours)} · {dayShoot.videos_planned} videos <StatusBadge status={dayShoot.status} />
          </p>
        )}
        {dayWindows.length === 0 ? (
          <p className="muted">No free time on this date yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dayWindows.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {fmtTime(w.start_time)} – {fmtTime(w.end_time)} <span className="text-gray-600">({fmtHours(w.hours)})</span>
                </span>
                <SmallAction action={deleteAvailability} fields={{ id: w.id }} label="Remove" variant="danger" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2">
        <h2>Add free time</h2>
        <p className="muted">
          You can split a day into several windows (for example 09:00–12:00 and 15:00–18:00), up to 6 hours in total.
        </p>
        <AvailabilityForm key={selected} dates={dates} selected={selected} />
      </section>

      <section className="card">
        <h2 className="mb-2">All my free time</h2>
        {windows.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link className="underline" href={`/calendar?date=${w.date}`}>
                      {fmtDate(w.date)}
                    </Link>
                  </td>
                  <td>{fmtTime(w.start_time)}</td>
                  <td>{fmtTime(w.end_time)}</td>
                  <td>{fmtHours(w.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
