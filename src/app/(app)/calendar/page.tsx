
import Link from 'next/link'
import { AvailabilityForm, EditAvailabilityForm } from '@/components/AvailabilityForm'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import {
  cairoToday,
  fmtDate,
  fmtHours,
  fmtTime,
  seasonDates,
} from '@/lib/dates'
import { getTargets, requireRole } from '@/lib/session'
import type { Availability, ShootDay } from '@/lib/types'
import { deleteAvailability, respondToShootDay } from '../actions'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function monthName(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function MyCalendar({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { supabase, me } = await requireRole()
  const targets = await getTargets()
  const dates = seasonDates(targets.season_start, targets.season_end)
  const today = cairoToday()
  const { date: qDate } = await searchParams

  const selected =
    qDate && dates.includes(qDate)
      ? qDate
      : dates.includes(today)
        ? today
        : dates[0]

  const [{ data: avail }, { data: shoots }] = await Promise.all([
    supabase
      .from('availability')
      .select('*')
      .eq('person_id', me.id)
      .order('date')
      .order('start_time'),
    supabase
      .from('shoot_days')
      .select('*')
      .eq('person_id', me.id)
      .order('date'),
  ])

  const windows = (avail ?? []) as Availability[]
  const myShoots = (shoots ?? []) as ShootDay[]

  const approvedWindows = windows.filter((w) => w.status === 'approved')
  const pendingWindows = windows.filter((w) => w.status === 'pending')

  const hoursByDate = new Map<string, number>()
  const pendingByDate = new Map<string, number>()

  for (const w of approvedWindows) {
    hoursByDate.set(
      w.date,
      (hoursByDate.get(w.date) ?? 0) + Number(w.hours)
    )
  }

  for (const w of pendingWindows) {
    pendingByDate.set(
      w.date,
      (pendingByDate.get(w.date) ?? 0) + 1
    )
  }

  const shootByDate = new Map(myShoots.map((s) => [s.date, s]))

  const totalHours = approvedWindows.reduce(
    (a, w) => a + Number(w.hours),
    0
  )

  const offers = myShoots.filter((s) => s.status === 'offered')
  const upcoming = myShoots.filter(
    (s) => s.status === 'confirmed' && s.date >= today
  )

  // Build a complete Sunday-start monthly calendar.
  const monthStart = `${selected.slice(0, 7)}-01`
  const nextMonthStart =
    shiftDate(monthStart, 32).slice(0, 7) + '-01'
  const lastDay = shiftDate(nextMonthStart, -1)

  const firstWeekday = new Date(
    `${monthStart}T00:00:00Z`
  ).getUTCDay()

  const daysInMonth = Number(lastDay.slice(8, 10))
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const gridStart = shiftDate(monthStart, -firstWeekday)

  const calendarDates = Array.from(
    { length: totalCells },
    (_, i) => shiftDate(gridStart, i)
  )

  const previousDate = dates.find((d) => d < monthStart)
  const nextDate = dates.find((d) => d > lastDay)

  const monthWindows = windows.filter(
    (w) => w.date >= monthStart && w.date <= lastDay
  )

  const monthShoots = myShoots.filter(
    (s) => s.date >= monthStart && s.date <= lastDay
  )

  const selectedWindows = windows.filter((w) => w.date === selected)
  const dayUsed = hoursByDate.get(selected) ?? 0
  const dayShoot = shootByDate.get(selected)

  return (
    <>
      <div>
        <h1>My calendar</h1>
        <p className="muted">
          {fmtDate(targets.season_start)} – {fmtDate(targets.season_end)}
          {' · '}Cairo time · max 4 h per day
        </p>

        <p className="mt-1 text-sm">
          You have <strong>{fmtHours(totalHours)}</strong> of approved free
          time across <strong>{hoursByDate.size}</strong> days.
        </p>
      </div>

      {offers.length > 0 && (
        <section className="card space-y-3 border-amber-400">
          <h2>Shoot days waiting for your answer</h2>

          {offers.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="text-sm">
                <strong>{fmtDate(s.date)}</strong>
                {s.start_time && ` from ${fmtTime(s.start_time)}`}
                {' · '}{fmtHours(s.hours)} · {s.videos_planned} videos
              </div>

              <div className="flex gap-2">
                <SmallAction
                  action={respondToShootDay}
                  fields={{ id: s.id, accept: 'yes' }}
                  label="Accept"
                  variant="primary"
                />
                <SmallAction
                  action={respondToShootDay}
                  fields={{ id: s.id, accept: 'no' }}
                  label="Decline"
                />
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
              {s.start_time && ` from ${fmtTime(s.start_time)}`}
              {' · '}{fmtHours(s.hours)} · {s.videos_planned} videos{' '}
              <StatusBadge status={s.status} />
            </p>
          ))}
        </section>
      )}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {previousDate ? (
            <Link
              href={`/calendar?date=${previousDate}`}
              className="rounded border px-3 py-2 text-sm"
            >
              ← Previous month
            </Link>
          ) : (
            <span />
          )}

          <div className="text-center">
            <h2 className="text-lg font-semibold">
              {monthName(monthStart)}
            </h2>
            <p className="text-xs text-gray-500">Monthly availability</p>
          </div>

          {nextDate ? (
            <Link
              href={`/calendar?date=${nextDate}`}
              className="rounded border px-3 py-2 text-sm"
            >
              Next month →
            </Link>
          ) : (
            <span />
          )}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold text-gray-500"
            >
              {day}
            </div>
          ))}

          {calendarDates.map((date) => {
            const inMonth = date.slice(0, 7) === monthStart.slice(0, 7)
            const inSeason = dates.includes(date)
            const isSelected = date === selected
            const isToday = date === today
            const hours = hoursByDate.get(date) ?? 0
            const pending = pendingByDate.get(date) ?? 0
            const shoot = shootByDate.get(date)

            return (
              <div
                key={date}
                className={`min-w-0 min-h-24 rounded-lg border p-1 ${
                  !inMonth
                    ? 'border-gray-100 bg-gray-50'
                    : !inSeason
                      ? 'border-gray-100 bg-gray-50'
                      : isSelected
                        ? 'border-2 border-gray-900 bg-gray-50'
                        : 'border-gray-200 bg-white'
                }`}
              >
                {inMonth && inSeason ? (
                  <Link
                    href={`/calendar?date=${date}`}
                    aria-current={isSelected ? 'date' : undefined}
                    aria-label={`Select ${fmtDate(date)}`}
                    className="block min-h-20"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`text-xs ${
                          isToday
                            ? 'rounded-full bg-gray-900 px-2 py-1 font-bold text-white'
                            : 'font-medium text-gray-800'
                        }`}
                      >
                        {Number(date.slice(8, 10))}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {hours > 0 && (
                        <div className="truncate rounded bg-green-100 px-1 py-1 text-[9px] font-semibold text-green-800">
                          {fmtHours(hours)} free
                        </div>
                      )}

                      {pending > 0 && (
                        <div className="truncate rounded bg-amber-100 px-1 py-1 text-[9px] font-semibold text-amber-800">
                          {pending} pending
                        </div>
                      )}

                      {shoot && (
                        <div className="truncate rounded bg-purple-100 px-1 py-1 text-[9px] font-semibold text-purple-800">
                          Shoot · {shoot.status}
                        </div>
                      )}

                      {hours === 0 && pending === 0 && !shoot && (
                        <span className="text-[9px] text-gray-300">
                          No events
                        </span>
                      )}
                    </div>
                  </Link>
                ) : (
                  <div className="flex min-h-20 flex-col items-start gap-1">
                    <span className="text-xs text-gray-300">
                      {Number(date.slice(8, 10))}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3 border-t pt-3 text-xs text-gray-600">
          <span className="text-green-700">● Approved free hours</span>
          <span className="text-amber-700">● Pending approval</span>
          <span className="text-purple-700">● Shoot Day</span>
          <span>Today is highlighted</span>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3 text-center">
          <div>
            <p className="text-xl font-semibold text-green-700">
              {monthWindows.filter((w) => w.status === 'approved').length}
            </p>
            <p className="text-xs text-gray-500">Approved windows this month</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-amber-700">
              {monthWindows.filter((w) => w.status === 'pending').length}
            </p>
            <p className="text-xs text-gray-500">Pending windows this month</p>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>{fmtDate(selected)}</h2>
          <span className="text-sm text-gray-700">
            {fmtHours(dayUsed)} of 4 h approved
          </span>
        </div>

        {dayShoot && (
          <p className="text-sm">
            Shoot day: {dayShoot.start_time && `${fmtTime(dayShoot.start_time)} · `}
            {fmtHours(dayShoot.hours)} · {dayShoot.videos_planned} videos{' '}
            <StatusBadge status={dayShoot.status} />
          </p>
        )}

        {selectedWindows.length === 0 ? (
          <p className="muted">No free time on this date yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selectedWindows.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {fmtTime(w.start_time)} – {fmtTime(w.end_time)}{' '}
                  <span className="text-gray-600">
                    ({fmtHours(w.hours)})
                  </span>
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={w.status} />
                  <EditAvailabilityForm item={w} />
                  <SmallAction
                    action={deleteAvailability}
                    fields={{ id: w.id }}
                    label="Remove"
                    variant="danger"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2">
        <h2>Add free time</h2>
        <p className="muted">
          You can split a day into several windows, with up to 4 hours in total.
        </p>

        <AvailabilityForm
          key={selected}
          dates={dates}
          selected={selected}
        />
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
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link
                      className="underline"
                      href={`/calendar?date=${w.date}`}
                    >
                      {fmtDate(w.date)}
                    </Link>
                  </td>
                  <td>{fmtTime(w.start_time)}</td>
                  <td>{fmtTime(w.end_time)}</td>
                  <td>{fmtHours(w.hours)}</td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
