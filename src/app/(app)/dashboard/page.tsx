import Link from 'next/link'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { AvailabilityForm, TimeSelect } from '@/components/AvailabilityForm'
import { ProgressBar } from '@/components/ProgressBar'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { fmtDate, fmtHours, fmtTime, seasonDates } from '@/lib/dates'
import { canEditAll, getTargets, requireRole } from '@/lib/session'
import type { Availability, Person, ShootDay, Targets } from '@/lib/types'
import {
  assignPhotographer,
  createShootDay,
  deleteAvailability,
  deleteShootDay,
  removePhotographerAssignment,
  reviewAvailability,
  updatePhotographerAgreement,
  updateShootDay,
  updateTargets,
} from '../actions'

const STATUSES = ['free', 'offered', 'confirmed', 'completed'] as const
type ShootPhotographer = {
  id: string
  shoot_day_id: string
  photographer_id: string
  agreed_amount: number
  people: Pick<Person, 'name'> | null
}
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { supabase, me } = await requireRole('manager', 'member')
  const canEdit = canEditAll(me)
  const isManager = me.role === 'manager'
  const targets = await getTargets()
  const dates = seasonDates(targets.season_start, targets.season_end)
  const { person: personFilter } = await searchParams

  const [{ data: p }, { data: a }, { data: s }, { data: sp }] = await Promise.all([
  supabase.from('people').select('*').order('name'),
  supabase.from('availability').select('*').order('date').order('start_time'),
  supabase.from('shoot_days').select('*').order('date').order('created_at'),
  supabase
    .from('shoot_photographers')
    .select('id, shoot_day_id, photographer_id, agreed_amount, people!shoot_photographers_photographer_id_fkey(name)')
    .order('created_at'),
])
  const people = (p ?? []) as Person[]
  const avail = (a ?? []) as Availability[]
  const shoots = (s ?? []) as ShootDay[]
  const photographerAssignments = (sp ?? []) as unknown as ShootPhotographer[]
  
  const photographers = people.filter((x) => x.role === 'photographer')
  const assignmentsByShoot = new Map<string, ShootPhotographer[]>()

  for (const assignment of photographerAssignments) {
    assignmentsByShoot.set(
      assignment.shoot_day_id,
      [...(assignmentsByShoot.get(assignment.shoot_day_id) ?? []), assignment],
    )
  }
  const models = people.filter((x) => x.role === 'model')
  const nameOf = new Map(people.map((x) => [x.id, x.name]))

  // ---- totals for the progress bars ----
  const booked = shoots.filter((d) => d.status === 'confirmed' || d.status === 'completed')
  const hoursBooked = booked.reduce((t, d) => t + Number(d.hours), 0)
  const videosAssigned = shoots.filter((d) => d.person_id).reduce((t, d) => t + d.videos_planned, 0)
  const completedDays = shoots.filter((d) => d.status === 'completed').length

  // ---- availability grouped by date ----
  const shownAvail = personFilter ? avail.filter((w) => w.person_id === personFilter) : avail
  const byDate = new Map<string, Availability[]>()
  for (const w of shownAvail) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w])

  return (
    <>
           <div>
        <h1>Manager dashboard</h1>
        <p className="muted">
          {fmtDate(targets.season_start)} – {fmtDate(targets.season_end)} · all times Cairo
          {!canEdit && ' · view only'}
        </p>

        <Link
          href="/team-calendar"
          className="mt-3 inline-block rounded border px-3 py-2 text-sm underline"
        >
          Open Team Calendar →
        </Link>
      </div>

      <section className="card space-y-4">
        <h2>Progress</h2>
        <ProgressBar label="Hours booked" value={hoursBooked} target={Number(targets.target_hours)} unit=" h" note="Confirmed + completed shoot days." />
        <ProgressBar label="Videos assigned" value={videosAssigned} target={targets.target_videos} note="Videos planned on shoot days that have a model." />
        <ProgressBar
          label="Shoot days booked"
          value={booked.length}
          target={targets.target_days_max}
          note={`Target ${targets.target_days_min}–${targets.target_days_max} days · ${completedDays} completed.`}
        />
        {isManager && <TargetsForm targets={targets} />}
      </section>

      <section className="card space-y-3">
        <h2>Shoot days</h2>
        {shoots.length === 0 && <p className="muted">No shoot days yet.</p>}
        <ul className="divide-y divide-gray-100">
          {shoots.map((d) => (
            <li key={d.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <strong>{fmtDate(d.date)}</strong>
                  {d.start_time && ` · ${fmtTime(d.start_time)}`} · {fmtHours(d.hours)} · {d.videos_planned} videos
                  <div className="text-gray-700">{d.person_id ? nameOf.get(d.person_id) : 'Nobody assigned'}</div>
                  {d.notes && <div className="text-xs text-gray-600">{d.notes}</div>}
                </div>
                <StatusBadge status={d.status} />
              </div>
              {canEdit && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-gray-700 underline">Edit</summary>
                  <div className="mt-2 rounded border border-gray-200 p-3">
                    <ShootDayForm dates={dates} models={models} day={d} />
                    {isManager && (
  <div className="mt-4 space-y-3 border-t pt-3">
    <h3 className="font-medium">Photographers assigned</h3>

    {(assignmentsByShoot.get(d.id) ?? []).length === 0 && (
      <p className="text-sm text-gray-600">No photographers assigned.</p>
    )}

    {(assignmentsByShoot.get(d.id) ?? []).map((assignment) => (
      <div key={assignment.id} className="flex flex-wrap items-end gap-2 rounded border p-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {assignment.people?.name ?? 'Photographer'}
          </p>
          <ActionForm action={updatePhotographerAgreement} className="mt-2 flex items-end gap-2">
            <input type="hidden" name="id" value={assignment.id} />
            <div>
              <label htmlFor={`agreement-${assignment.id}`} className="text-xs">
                Agreed amount ({targets.currency})
              </label>
              <input
                id={`agreement-${assignment.id}`}
                name="agreed_amount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={assignment.agreed_amount}
                className="w-32"
                required
              />
            </div>
            <SubmitButton variant="secondary">Save amount</SubmitButton>
          </ActionForm>
        </div>

        <SmallAction
          action={removePhotographerAssignment}
          fields={{ id: assignment.id }}
          label="Remove"
          variant="danger"
        />
      </div>
    ))}

    {photographers.length > 0 ? (
      <ActionForm action={assignPhotographer} className="grid grid-cols-2 gap-2 rounded border p-3">
        <input type="hidden" name="shoot_day_id" value={d.id} />
        <div className="col-span-2">
          <label htmlFor={`photographer-${d.id}`}>Add photographer</label>
          <select id={`photographer-${d.id}`} name="photographer_id" required defaultValue="">
            <option value="">Choose photographer</option>
            {photographers
              .filter((person) => !(assignmentsByShoot.get(d.id) ?? []).some(
                (assignment) => assignment.photographer_id === person.id
              ))
              .map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
          </select>
        </div>
        <div className="col-span-2">
          <label htmlFor={`new-agreement-${d.id}`}>
            Agreed amount ({targets.currency})
          </label>
          <input
            id={`new-agreement-${d.id}`}
            name="agreed_amount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            required
          />
        </div>
        <div className="col-span-2">
          <SubmitButton>Add photographer</SubmitButton>
        </div>
      </ActionForm>
    ) : (
      <p className="text-sm text-gray-600">
        No photographer accounts yet. Add one in People first.
      </p>
    )}
  </div>
)}
                    <div className="mt-2">
                      <SmallAction action={deleteShootDay} fields={{ id: d.id }} label="Delete shoot day" variant="danger" />
                    </div>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <details>
            <summary className="cursor-pointer text-sm font-medium underline">Add a shoot day</summary>
            <div className="mt-2 rounded border border-gray-200 p-3">
              <ShootDayForm dates={dates} models={models} />
            </div>
          </details>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2">Models</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Free time</th>
              <th>Booked</th>
              <th>Videos</th>
              <th>Done</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const mine = shoots.filter((d) => d.person_id === m.id)
              return (
                <tr key={m.id}>
                  <td>
                    <Link className="underline" href={`/dashboard?person=${m.id}#availability`}>
                      {m.name}
                    </Link>
                  </td>
                  <td>{fmtHours(avail.filter((w) => w.person_id === m.id && w.status === 'approved').reduce((t, w) => t + Number(w.hours), 0))}</td>
                  <td>{mine.filter((d) => d.status === 'confirmed' || d.status === 'completed').length} days</td>
                  <td>{mine.reduce((t, d) => t + d.videos_planned, 0)}</td>
                  <td>{mine.filter((d) => d.status === 'completed').length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section id="availability" className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Availability by date</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className={!personFilter ? 'font-semibold' : 'underline'} href="/dashboard#availability">
              Everyone
            </Link>
            {models.map((m) => (
              <Link key={m.id} className={personFilter === m.id ? 'font-semibold' : 'underline'} href={`/dashboard?person=${m.id}#availability`}>
                {m.name}
              </Link>
            ))}
          </div>
        </div>
        {byDate.size === 0 && <p className="muted">No availability yet.</p>}
        <div className="divide-y divide-gray-100">
          {[...byDate.entries()].map(([date, ws]) => {
            const shootsThatDay = shoots.filter((d) => d.date === date)
            return (
              <div key={date} className="py-2">
                <p className="text-sm font-semibold">
                  {fmtDate(date)}
                  {shootsThatDay.length > 0 && (
                    <span className="ml-2 font-normal text-gray-600">
                      · {shootsThatDay.length} shoot day{shootsThatDay.length > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                <ul>
                  {ws.map((w) => (
                    
<li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
  <div className="flex flex-wrap items-center gap-2">
    <span>
      <strong>{nameOf.get(w.person_id) ?? 'Unknown model'}</strong>
      {' · '}{fmtTime(w.start_time)}–{fmtTime(w.end_time)}{' '}
      <span className="text-gray-600">({fmtHours(w.hours)})</span>
    </span>
    <StatusBadge status={w.status} />
  </div>

  <div className="flex flex-wrap items-center gap-2">
    {canEdit && w.status === 'pending' && (
      <>
        <SmallAction
          action={reviewAvailability}
          fields={{ id: w.id, status: 'approved' }}
          label="Approve"
          variant="primary"
        />
        <SmallAction
          action={reviewAvailability}
          fields={{ id: w.id, status: 'rejected' }}
          label="Reject"
          variant="danger"
        />
      </>
    )}
    {canEdit && (
      <SmallAction
        action={deleteAvailability}
        fields={{ id: w.id }}
        label="Remove"
        variant="danger"
      />
    )}
  </div>
</li>

                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        {canEdit && (
          <details>
            <summary className="cursor-pointer text-sm font-medium underline">Add availability for someone</summary>
            <div className="mt-2 rounded border border-gray-200 p-3">
              <AvailabilityForm dates={dates} people={models} />
            </div>
          </details>
        )}
      </section>
    </>
  )
}

function TargetsForm({ targets }: { targets: Targets }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium underline">Edit targets</summary>
      <ActionForm action={updateTargets} className="mt-2 grid grid-cols-2 gap-3 rounded border border-gray-200 p-3">
        <div>
          <label htmlFor="target_hours">Total shoot hours</label>
          <input id="target_hours" name="target_hours" type="number" min={0} step={0.5} defaultValue={targets.target_hours} required />
        </div>
        <div>
          <label htmlFor="target_videos">Total videos</label>
          <input id="target_videos" name="target_videos" type="number" min={0} defaultValue={targets.target_videos} required />
        </div>
        <div>
          <label htmlFor="target_days_min">Shoot days (min)</label>
          <input id="target_days_min" name="target_days_min" type="number" min={0} defaultValue={targets.target_days_min} required />
        </div>
        <div>
          <label htmlFor="target_days_max">Shoot days (max)</label>
          <input id="target_days_max" name="target_days_max" type="number" min={0} defaultValue={targets.target_days_max} required />
        </div>
        <div className="col-span-2">
          <SubmitButton>Save targets</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}

function ShootDayForm({ dates, models, day }: { dates: string[]; models: Person[]; day?: ShootDay }) {
  const p = day ? `sd-${day.id}-` : 'sd-new-'
  return (
    <ActionForm action={day ? updateShootDay : createShootDay} className="grid grid-cols-2 gap-3" resetOnSuccess={!day}>
      {day && <input type="hidden" name="id" value={day.id} />}
      <div>
        <label htmlFor={`${p}date`}>Date</label>
        <select id={`${p}date`} name="date" defaultValue={day?.date ?? dates[0]} required>
          {dates.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d)}
            </option>
          ))}
        </select>
      </div>
      <TimeSelect id={`${p}start`} name="start_time" label="Start (Cairo)" defaultValue={day?.start_time ? fmtTime(day.start_time) : '10:00'} />
      <div>
        <label htmlFor={`${p}hours`}>Hours (max 6)</label>
        <input id={`${p}hours`} name="hours" type="number" min={0.5} max={4} step={0.5} defaultValue={day?.hours ?? 4} required />
      </div>
      <div>
        <label htmlFor={`${p}videos`}>Videos planned</label>
        <input id={`${p}videos`} name="videos_planned" type="number" min={0} defaultValue={day?.videos_planned ?? 4} required />
      </div>
      <div>
        <label htmlFor={`${p}person`}>Model</label>
        <select id={`${p}person`} name="person_id" defaultValue={day?.person_id ?? ''}>
          <option value="">— Nobody (free) —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${p}status`}>Status</label>
        <select id={`${p}status`} name="status" defaultValue={day?.status ?? 'free'}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label htmlFor={`${p}notes`}>Notes</label>
        <input id={`${p}notes`} name="notes" defaultValue={day?.notes ?? ''} placeholder="Optional" />
      </div>
      <p className="col-span-2 text-xs text-gray-600">
        Picking a model sets the day to &quot;offered&quot; until she accepts. No model = &quot;free&quot;. Marking &quot;completed&quot; adds it to Pay.
      </p>
      <div className="col-span-2">
        <SubmitButton>{day ? 'Save' : 'Add shoot day'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
