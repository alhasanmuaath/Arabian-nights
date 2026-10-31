import { addAvailability } from '@/app/(app)/actions'
import { dayNum, fmtDateShort } from '@/lib/dates'
import type { Person } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'

/** Times every 30 minutes, 00:00 – 24:00 (Cairo). */
const TIMES = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

export function TimeSelect({ name, label, defaultValue, id }: { name: string; label: string; defaultValue: string; id?: string }) {
  return (
    <div>
      <label htmlFor={id ?? name}>{label}</label>
      <select id={id ?? name} name={name} defaultValue={defaultValue}>
        {TIMES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Add one window (start–end) to one or many dates. */
export function AvailabilityForm({
  dates,
  selected,
  people,
}: {
  dates: string[]
  selected?: string
  people?: Person[] // when set, show a "for whom" picker (manager / edit members)
}) {
  return (
    <ActionForm action={addAvailability} className="space-y-3" resetOnSuccess>
      {people && (
        <div>
          <label htmlFor="av-person">Person</label>
          <select id="av-person" name="person_id" required>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TimeSelect id="av-start" name="start_time" label="Start (Cairo)" defaultValue="10:00" />
        <TimeSelect id="av-end" name="end_time" label="End (Cairo)" defaultValue="16:00" />
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-gray-800">Dates</legend>
        <p className="mb-2 text-xs text-gray-600">Tick every date this window applies to.</p>
        <div className="grid grid-cols-7 gap-1">
          {dates.map((d) => (
            <label key={d} className="block">
              <input type="checkbox" name="dates" value={d} defaultChecked={d === selected} className="peer sr-only" />
              <span
                title={fmtDateShort(d)}
                className="flex h-10 flex-col items-center justify-center rounded border border-gray-300 bg-white text-xs peer-checked:border-gray-900 peer-checked:bg-gray-900 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2"
              >
                <span className="font-medium">{dayNum(d)}</span>
                <span className="text-[10px] leading-none">{fmtDateShort(d).split(' ')[1]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton>Add window</SubmitButton>
    </ActionForm>
  )
}
