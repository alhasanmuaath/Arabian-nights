
import { addAvailability, updateAvailability } from '@/app/(app)/actions'
import { dayNum, fmtDateShort } from '@/lib/dates'
import type { Person } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'

/** Times every 30 minutes, 00:00–24:00 (Cairo). */
const TIMES = Array.from(
  { length: 49 },
  (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
)

export function TimeSelect({
  name,
  label,
  defaultValue,
  id,
  optional = false,
}: {
  name: string
  label: string
  defaultValue: string
  id?: string
  optional?: boolean
}) {
  return (
    <div>
      <label htmlFor={id ?? name}>{label}</label>
      <select id={id ?? name} name={name} defaultValue={defaultValue}>
        {optional && <option value="">Not set</option>}
        {TIMES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}

export function AvailabilityForm({
  dates,
  selected,
  people,
}: {
  dates: string[]
  selected?: string
  people?: Person[]
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
        <TimeSelect
          id="av-start"
          name="start_time"
          label="First start (Cairo)"
          defaultValue="10:00"
        />
        <TimeSelect
          id="av-end"
          name="end_time"
          label="First end (Cairo)"
          defaultValue="16:00"
        />
      </div>

      <details className="rounded-lg border border-gray-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          + Add second window (Split Day)
        </summary>

        <p className="my-2 text-xs text-gray-600">
          Optional: add another availability period after a break.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <TimeSelect
            id="av-second-start"
            name="second_start"
            label="Second start"
            defaultValue=""
            optional
          />
          <TimeSelect
            id="av-second-end"
            name="second_end"
            label="Second end"
            defaultValue=""
            optional
          />
        </div>
      </details>

      <fieldset>
        <legend className="text-sm font-medium text-gray-800">
          Dates
        </legend>

        <p className="mb-2 text-xs text-gray-600">
          Tick every date these windows apply to.
        </p>

        <div className="grid grid-cols-7 gap-1">
          {dates.map((d) => (
            <label key={d} className="block">
              <input
                type="checkbox"
                name="dates"
                value={d}
                defaultChecked={d === selected}
                className="peer sr-only"
              />
              <span
                title={fmtDateShort(d)}
                className="flex h-10 flex-col items-center justify-center rounded border border-gray-300 bg-white text-xs peer-checked:border-gray-900 peer-checked:bg-gray-900 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2"
              >
                <span className="font-medium">{dayNum(d)}</span>
                <span className="text-[10px] leading-none">
                  {fmtDateShort(d).split(' ')[1]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {people ? (
        <p className="text-xs text-gray-600">
          Availability added by a manager or authorized editor is approved immediately.
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          Your availability request will remain pending until a manager approves it.
        </p>
      )}

      <SubmitButton>Add availability</SubmitButton>
    </ActionForm>
  )
}

export function EditAvailabilityForm({
  item,
}: {
  item: {
    id: string
    date: string
    start_time: string
    end_time: string
  }
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm underline">
        Edit availability
      </summary>

      <ActionForm
        action={updateAvailability}
        className="mt-2 grid grid-cols-2 gap-3 rounded border border-gray-200 p-3"
      >
        <input type="hidden" name="id" value={item.id} />

        <div className="col-span-2">
          <label htmlFor={`edit-date-${item.id}`}>Date</label>
          <input
            id={`edit-date-${item.id}`}
            type="date"
            name="date"
            defaultValue={item.date}
            required
          />
        </div>

        <TimeSelect
          name="start_time"
          label="Start"
          defaultValue={item.start_time.slice(0, 5)}
          id={`edit-start-${item.id}`}
        />

        <TimeSelect
          name="end_time"
          label="End"
          defaultValue={item.end_time.slice(0, 5)}
          id={`edit-end-${item.id}`}
        />

        <div className="col-span-2">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}
