import { createShoot, updateShoot } from '@/app/(app)/actions'
import { fmtDate, fmtTime } from '@/lib/dates'
import type { ShootDay, TeamMember } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'
import { PeopleChecklist } from './AudiencePicker'
import { SessionFields } from './SessionFields'

/** Manager: create a shoot day, or edit its details. */
export function ShootForm({
  dates,
  day,
  people,
  defaultDate,
}: {
  dates: string[]
  day?: ShootDay
  people?: TeamMember[] // only when creating: pick the crew straight away
  defaultDate?: string
}) {
  const p = day ? `e-${day.id}-` : 'new-'
  return (
    <ActionForm action={day ? updateShoot : createShoot} className="space-y-5">
      {day && <input type="hidden" name="id" value={day.id} />}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="eyebrow mb-2">The day</legend>
        <div>
          <label htmlFor={`${p}date`}>Date</label>
          <select id={`${p}date`} name="date" defaultValue={day?.date ?? defaultDate ?? dates[0]} required>
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmtDate(d)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${p}title`}>Name of the shoot</label>
          <input id={`${p}title`} name="title" maxLength={120} defaultValue={day?.title ?? ''} placeholder="e.g. Sunset camp scenes" />
        </div>
        <SessionFields
          idPrefix={p}
          startTime={fmtTime(day?.start_time ?? null)}
          totalHours={Number(day?.hours ?? 4)}
          secondStartTime={fmtTime(day?.second_start_time ?? null)}
          secondHours={day?.second_hours ? Number(day.second_hours) : null}
        />
        <div>
          <label htmlFor={`${p}videos`}>Videos planned</label>
          <input id={`${p}videos`} name="videos_planned" type="number" min={0} defaultValue={day?.videos_planned ?? 4} required />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="eyebrow mb-2">Meeting</legend>
        <div>
          <label htmlFor={`${p}mtime`}>Meeting time (Cairo)</label>
          <input id={`${p}mtime`} name="meeting_time" type="time" defaultValue={fmtTime(day?.meeting_time ?? null)} />
        </div>
        <div>
          <label htmlFor={`${p}mpoint`}>Meeting point</label>
          <input id={`${p}mpoint`} name="meeting_point" maxLength={200} defaultValue={day?.meeting_point ?? ''} placeholder="e.g. Gate 2, Mall of Arabia" />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="eyebrow mb-2">Location</legend>
        <div>
          <label htmlFor={`${p}lname`}>Place</label>
          <input id={`${p}lname`} name="location_name" maxLength={150} defaultValue={day?.location_name ?? ''} placeholder="e.g. Arabian Night camp" />
        </div>
        <div>
          <label htmlFor={`${p}laddr`}>Address / directions</label>
          <input id={`${p}laddr`} name="location_address" maxLength={300} defaultValue={day?.location_address ?? ''} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${p}lurl`}>Google Maps link</label>
          <input id={`${p}lurl`} name="location_url" inputMode="url" maxLength={500} defaultValue={day?.location_url ?? ''} placeholder="https://maps.app.goo.gl/…" />
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${p}notes`}>Notes for the crew</label>
        <textarea id={`${p}notes`} name="notes" rows={2} maxLength={1000} defaultValue={day?.notes ?? ''} placeholder="Outfits, props, what to bring…" />
      </div>

      {people && (
        <fieldset>
          <legend className="eyebrow mb-2">Who should be there</legend>
          <PeopleChecklist people={people} />
          <p className="faint mt-2">Each person is asked to accept or decline. You can change the crew later.</p>
        </fieldset>
      )}

      <SubmitButton>{day ? 'Save details' : 'Create shoot day'}</SubmitButton>
    </ActionForm>
  )
}
