import { ProgressBar } from '@/components/ProgressBar'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, fmtHours, fmtTime } from '@/lib/dates'
import { requireRole } from '@/lib/session'
import type { Availability, ShootDay } from '@/lib/types'
import { respondToShootDay } from '../actions'

export default async function MyProgress() {
  const { supabase, me } = await requireRole('model')
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.from('availability').select('hours').eq('person_id', me.id).eq('status', 'approved'),
    supabase.from('shoot_days').select('*').eq('person_id', me.id).order('date'),
  ])
  const avail = (a ?? []) as Pick<Availability, 'hours'>[]
  const days = (s ?? []) as ShootDay[]

  const offeredHours = avail.reduce((t, w) => t + Number(w.hours), 0)
  const booked = days.filter((d) => d.status === 'confirmed' || d.status === 'completed')
  const completed = days.filter((d) => d.status === 'completed')
  const bookedHours = booked.reduce((t, d) => t + Number(d.hours), 0)
  const completedHours = completed.reduce((t, d) => t + Number(d.hours), 0)
  const videosAssigned = days.reduce((t, d) => t + d.videos_planned, 0)
  const videosDone = completed.reduce((t, d) => t + d.videos_planned, 0)

  return (
    <>
      <h1>My progress</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Approved free time" value={fmtHours(offeredHours)} />
        <Stat label="Hours booked" value={fmtHours(bookedHours)} />
        <Stat label="Videos assigned" value={String(videosAssigned)} />
        <Stat label="Days completed" value={String(completed.length)} />
      </section>

      <section className="card space-y-4">
        <ProgressBar label="Hours shot" value={completedHours} target={bookedHours} unit=" h" note="Completed hours out of your booked (confirmed + completed) hours." />
        <ProgressBar label="Videos done" value={videosDone} target={videosAssigned} note="Videos on completed days out of all videos assigned to you." />
      </section>

      <section className="card">
        <h2 className="mb-2">My shoot days</h2>
        {days.length === 0 ? (
          <p className="muted">No shoot days assigned to you yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Hours</th>
                <th>Videos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.id}>
                  <td>
                    {fmtDate(d.date)}
                    {d.start_time && <div className="text-xs text-gray-600">from {fmtTime(d.start_time)}</div>}
                  </td>
                  <td>{fmtHours(d.hours)}</td>
                  <td>{d.videos_planned}</td>
                  <td>
                    <StatusBadge status={d.status} />
                    {d.status === 'offered' && (
                      <div className="mt-1 flex gap-1">
                        <SmallAction action={respondToShootDay} fields={{ id: d.id, accept: 'yes' }} label="Accept" variant="primary" />
                        <SmallAction action={respondToShootDay} fields={{ id: d.id, accept: 'no' }} label="Decline" />
                      </div>
                    )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
