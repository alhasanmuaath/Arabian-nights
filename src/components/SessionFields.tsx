'use client'

import { useState } from 'react'

/**
 * Start time and hours of a shoot day, with an option to split it into two
 * sessions (for example 2 h in the morning and 2 h in the evening).
 * Posts: start_time, hours (first session when split), split, second_start_time, second_hours.
 */
export function SessionFields({
  idPrefix,
  startTime,
  totalHours,
  secondStartTime,
  secondHours,
}: {
  idPrefix: string
  startTime: string
  totalHours: number
  secondStartTime: string
  secondHours: number | null
}) {
  const [split, setSplit] = useState(Boolean(secondStartTime))
  const initialFirst = secondHours ? totalHours - secondHours : totalHours
  const [first, setFirst] = useState(String(initialFirst))
  const [second, setSecond] = useState(String(secondHours ?? 2))

  const total = split ? Number(first || 0) + Number(second || 0) : Number(first || 0)
  const tooLong = total > 4

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}start`}>{split ? 'First session starts (Cairo)' : 'Shooting starts (Cairo)'}</label>
        <input id={`${idPrefix}start`} name="start_time" type="time" defaultValue={startTime} required={split} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}hours`}>{split ? 'First session hours' : 'Hours (max 4)'}</label>
        <input
          id={`${idPrefix}hours`}
          name="hours"
          type="number"
          min={0.5}
          max={4}
          step={0.5}
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          required
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium text-ink sm:col-span-2">
        <input
          type="checkbox"
          name="split"
          value="yes"
          checked={split}
          onChange={(e) => {
            setSplit(e.target.checked)
            // Turning the split on: share the 4 hours (2 + 2) instead of keeping 4 + 2.
            if (e.target.checked && Number(first) >= 4) setFirst('2')
            if (!e.target.checked && Number(first) === 2 && Number(second) === 2) setFirst('4')
          }}
        />
        Split into two sessions (for example morning and evening)
      </label>

      {split && (
        <>
          <div>
            <label htmlFor={`${idPrefix}start2`}>Second session starts (Cairo)</label>
            <input id={`${idPrefix}start2`} name="second_start_time" type="time" defaultValue={secondStartTime || '18:00'} required />
          </div>
          <div>
            <label htmlFor={`${idPrefix}hours2`}>Second session hours</label>
            <input
              id={`${idPrefix}hours2`}
              name="second_hours"
              type="number"
              min={0.5}
              max={3.5}
              step={0.5}
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              required
            />
          </div>
        </>
      )}

      <p className={`text-sm sm:col-span-2 ${tooLong ? 'text-no' : 'text-ink-3'}`} aria-live="polite">
        {split ? `Total: ${total} h across both sessions (at most 4 h).` : 'One session.'}
      </p>
    </>
  )
}
