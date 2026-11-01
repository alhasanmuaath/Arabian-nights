
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { cairoToday, fmtDate, fmtHours, fmtTime, seasonDates } from '@/lib/dates'
import { canEditAll, getTargets, requireRole } from '@/lib/session'
import type { Availability, Person, ShootDay } from '@/lib/types'

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

export default async function TeamCalendar({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { supabase, me } = await requireRole('manager', 'member')
  const canEdit = canEditAll(me)
  const targets = await getTargets()
  const dates = seasonDates(targets.season_start, targets.season_end)
  const today = cairoToday()
  const { date: queryDate } = await searchParams

  const selected =
    queryDate && dates.includes(queryDate)
      ? queryDate
      : dates.includes(today)
        ? today
        : dates[0]

  const monthStart = `${selected.slice(0, 7)}-01`
  const nextMonthStart = shiftDate(
    `${monthStart.slice(0, 7)}-01`,
    32
  ).slice(0, 7) + '-01'

  const lastDay = shiftDate(nextMonthStart, -1)
  const gridStart = shiftDate(monthStart, -new Date(`${monthStart}T00:00:00Z`).getUTCDay())

  const daysInMonth = Number(lastDay.slice(8, 10))
  const totalCells = Math.ceil(
    (new Date(`${monthStart}T00:00:00Z`).getUTCDay() + daysInMonth) / 7
  ) * 7

  const calendarDates = Array.from(
    { length: totalCells },
    (_, i) => shiftDate(gridStart, i)
  )

  const previousMonth = dates.find((d) => d < monthStart)
  const nextMonth = dates.find((d) => d > lastDay)

  const [{ data: peopleData }, { data: availabilityData }, { data: shootsData }] =
    await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('availability').select('*').order('date').order('start_time'),
      supabase.from('shoot_days').select('*').order('date').order('start_time'),
    ])

  const people = (peopleData ?? []) as Person[]
  const models = people.filter((p) => p.role === 'model')
  const availability = (availabilityData ?? []) as Availability[]
  const shoots = (shootsData ?? []) as ShootDay[]

  const nameOf = new Map(models.map((p) => [p.id, p.name]))

  const monthAvailability = availability.filter(
    (a) => a.date >= monthStart && a.date <= lastDay
  )

  const monthShoots = shoots.filter(
    (s) => s.date >= monthStart && s.date <= lastDay
  )

  const selectedAvailability = availability.filter(
    (a) => a.date === selected
  )

  const selectedShoots = shoots.filter(
    (s) => s.date === selected
  )

  const pendingCount = monthAvailability.filter(
    (a) => a.status === 'pending'
  ).length

  const approvedCount = monthAvailability.filter(
    (a) => a.status === 'approved'
  ).length

  const rejectedCount = monthAvailability.filter(
    (a) => a.status === 'rejected'
  ).length

  return (
    <div className="space-y-4">
      <div>
        <h1>Team calendar</h1>
        <p className="muted">
          {fmtDate(targets.season_start)} – {fmtDate(targets.season_end)}
          {' · '}Cairo time
          {!canEdit && ' · View only'}
        </p>
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {previousMonth ? (
            <Link
              href={`/team-calendar?date=${previousMonth}`}
              className="rounded border px-3 py-2 text-sm"
            >
              ← Previous month
            </Link>
          ) : (
            <span />
          )}

          <h2 className="text-lg font-semibold">
            {monthName(monthStart)}
          </h2>

          {nextMonth ? (
            <Link
              href={`/team-calendar?date=${nextMonth}`}
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

            const dayAvailability = monthAvailability.filter(
              (a) => a.date === date
            )

            const dayShoots = monthShoots.filter(
              (s) => s.date === date
            )

            return (
              <div
                key={date}
                className={`min-w-0 min-h-28 rounded-lg border p-1 ${
                  !inMonth
                    ? 'border-gray-100 bg-gray-50'
                    : !inSeason
                      ? 'border-gray-100 bg-gray-50'
                      : isSelected
                        ? 'border-2 border-gray-900 bg-gray-50'
                        : 'border-gray-200 bg-white'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      isToday
                        ? 'rounded-full bg-gray-900 px-2 py-1 font-bold text-white'
                        : inMonth
                          ? 'font-medium text-gray-800'
                          : 'text-gray-300'
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                  </span>

                  {dayShoots.length > 0 && (
                    <span className="text-[9px] font-bold text-purple-700">
                      SHOOT
                    </span>
                  )}
                </div>

                {inMonth && inSeason && (
                  <Link
                    href={`/team-calendar?date=${date}`}
                    aria-label={`Select ${fmtDate(date)}`}
                    className="block"
                  >
                    <div className="space-y-1">
                      {dayAvailability.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className={`truncate rounded px-1 py-1 text-[9px] font-medium ${
                            a.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : a.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                          title={`${nameOf.get(a.person_id) ?? 'Unknown'} · ${fmtTime(a.start_time)}–${fmtTime(a.end_time)} · ${a.status}`}
                        >
                          {nameOf.get(a.person_id) ?? 'Unknown'} · {fmtTime(a.start_time)}
                        </div>
                      ))}

                      {dayAvailability.length > 3 && (
                        <p className="text-center text-[9px] text-gray-500">
                          +{dayAvailability.length - 3} more
                        </p>
                      )}

                      {dayShoots.length > 0 && (
                        <div className="truncate rounded bg-purple-100 px-1 py-1 text-[9px] font-semibold text-purple-800">
                          {dayShoots.length} shoot day{dayShoots.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </Link>
                )}

                {inMonth && inSeason && dayAvailability.length === 0 && dayShoots.length === 0 && (
                  <Link
                    href={`/team-calendar?date=${date}`}
                    className="block min-h-16 text-[9px] text-gray-300"
                  >
                    No events
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3 border-t pt-3 text-xs">
          <span className="text-green-700">● Approved</span>
          <span className="text-amber-700">● Pending</span>
          <span className="text-red-700">● Rejected</span>
          <span className="text-purple-700">● Shoot Day</span>
          <span className="text-gray-500">Today is highlighted</span>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
          <div>
            <p className="text-xl font-semibold text-amber-700">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-green-700">{approvedCount}</p>
            <p className="text-xs text-gray-500">Approved</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-red-700">{rejectedCount}</p>
            <p className="text-xs text-gray-500">Rejected</p>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>{fmtDate(selected)}</h2>
          <span className="text-sm text-gray-600">
            {selectedAvailability.length} availability windows
          </span>
        </div>

        {selectedShoots.length > 0 && (
          <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
            <h3 className="font-semibold text-purple-900">
              Official Shoot Days
            </h3>
            {selectedShoots.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap justify-between gap-2 text-sm"
              >
                <span>
                  {s.start_time && `${fmtTime(s.start_time)} · `}
                  {fmtHours(s.hours)} · {s.videos_planned} videos
                  {' · '}
                  {s.person_id ? nameOf.get(s.person_id) : 'Unassigned'}
                </span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        )}

        {models.length === 0 ? (
          <p className="muted">No models found.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {models.map((model) => {
              const entries = selectedAvailability.filter(
                (a) => a.person_id === model.id
              )

              return (
                <div key={model.id} className="py-3">
                  <h3 className="font-semibold">{model.name}</h3>

                  {entries.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      No availability submitted.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {entries.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {fmtTime(a.start_time)} – {fmtTime(a.end_time)}
                            {' · '}{fmtHours(a.hours)}
                          </span>
                          <StatusBadge status={a.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {canEdit && (
        <section className="card space-y-2">
          <h2>Management actions</h2>
          <p className="muted">
            Review availability and manage official Shoot Days from the dashboard.
          </p>
          <Link
            href="/dashboard#availability"
            className="inline-block rounded border px-3 py-2 text-sm underline"
          >
            Review availability →
          </Link>
          <Link
            href="/dashboard"
            className="ml-2 inline-block rounded border px-3 py-2 text-sm underline"
          >
            Manage Shoot Days →
          </Link>
        </section>
      )}
    </div>
  )
}
