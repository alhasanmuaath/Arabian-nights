
import { requireRole } from '@/lib/session'
import { fmtDate, fmtHours, fmtTime } from '@/lib/dates'
import type { Person, ShootDay } from '@/lib/types'

export default async function PhotographerDashboard() {
  const { supabase, me } = await requireRole('photographer')

  // Find this photographer's assignments.
  const { data: assignments, error: assignmentError } = await supabase
    .from('shoot_photographers')
    .select('shoot_day_id')
    .eq('photographer_id', me.id)

  if (assignmentError) {
    return (
      <section className="card">
        <h1>Photographer Dashboard</h1>
        <p className="text-red-600">
          Could not load your assignments. Please contact the manager.
        </p>
      </section>
    )
  }

  const shootIds = [...new Set((assignments ?? []).map((a) => a.shoot_day_id))]

  let shoots: ShootDay[] = []
  let people: Person[] = []

  if (shootIds.length > 0) {
    const { data: shootData } = await supabase
      .from('shoot_days')
      .select('*')
      .in('id', shootIds)
      .order('date')
      .order('start_time')

    shoots = (shootData ?? []) as ShootDay[]

    const modelIds = [
      ...new Set(
        shoots
          .map((shoot) => shoot.person_id)
          .filter((id): id is string => Boolean(id))
      ),
    ]

    if (modelIds.length > 0) {
      const { data: modelData } = await supabase
        .from('people')
        .select('id, name')
        .in('id', modelIds)

      people = (modelData ?? []) as Person[]
    }
  }

  const modelNames = new Map(people.map((person) => [person.id, person.name]))

  const upcoming = shoots.filter(
    (shoot) => shoot.date >= new Date().toLocaleDateString('en-CA', {
      timeZone: 'Africa/Cairo',
    }) && shoot.status !== 'completed'
  )

  const completed = shoots.filter((shoot) => shoot.status === 'completed')

  return (
    <>
      <section>
        <h1>Photographer Dashboard</h1>
        <p className="muted">
          Welcome, {me.name}. Here are your assigned shoots.
        </p>
      </section>

      <section className="card space-y-3">
        <h2>Overview</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border p-3">
            <p className="text-sm text-gray-600">Upcoming shoots</p>
            <p className="text-2xl font-semibold">{upcoming.length}</p>
          </div>
          <div className="rounded border p-3">
            <p className="text-sm text-gray-600">Completed shoots</p>
            <p className="text-2xl font-semibold">{completed.length}</p>
          </div>
        </div>
      </section>

      <section id="schedule" className="card space-y-3">
        <h2>My Schedule</h2>

        {shoots.length === 0 ? (
          <p className="muted">
            You don't have any assigned shoots yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shoots.map((shoot) => (
              <li key={shoot.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{fmtDate(shoot.date)}</strong>
                  <span className="rounded border px-2 py-1 text-xs">
                    {shoot.status}
                  </span>
                </div>

                <p className="text-sm">
                  {shoot.start_time
                    ? `Start: ${fmtTime(shoot.start_time)}`
                    : 'Start time not set'}
                  {' · '}
                  {fmtHours(shoot.hours)}
                </p>

                <p className="text-sm">
                  Model: {shoot.person_id
                    ? modelNames.get(shoot.person_id) ?? 'Model assigned'
                    : 'No model assigned'}
                </p>

                <p className="text-sm">
                  Videos planned: {shoot.videos_planned}
                </p>

                {shoot.notes && (
                  <p className="text-sm text-gray-600">
                    Notes: {shoot.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
