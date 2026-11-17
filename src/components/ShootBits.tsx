import Link from 'next/link'
import { respondToShoot } from '@/app/(app)/actions'
import { dayNum, fmtTime, monthShort, relDay, weekdayShort } from '@/lib/dates'
import type { Attendee, ShootDay, TeamMember } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'
import { AvatarStack } from './Avatar'
import { Icon } from './Icon'
import { SmallAction } from './SmallAction'
import { StatusBadge } from './StatusBadge'

/** Calendar-leaf style date. */
export function DateBlock({ date, size = 'md' }: { date: string; size?: 'md' | 'lg' }) {
  const big = size === 'lg'
  return (
    <span
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl border border-white/14 bg-white/8 ${
        big ? 'h-[4.5rem] w-[4.5rem]' : 'h-14 w-14'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gold-300">{monthShort(date)}</span>
      <span className={`num font-bold leading-none ${big ? 'text-[1.75rem]' : 'text-xl'}`}>{dayNum(date)}</span>
      <span className="text-[10px] uppercase tracking-wide text-ink-3">{weekdayShort(date)}</span>
    </span>
  )
}

export function crewOf(day: ShootDay, attendees: Attendee[], team: Map<string, TeamMember>) {
  return attendees
    .filter((a) => a.shoot_day_id === day.id)
    .map((a) => ({ ...a, name: team.get(a.person_id)?.name ?? 'Someone', role: team.get(a.person_id)?.role ?? 'model' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** One shoot day in a list: date, title, time, place, who is coming. */
export function ShootRow({
  day,
  attendees,
  team,
  today,
}: {
  day: ShootDay
  attendees: Attendee[]
  team: Map<string, TeamMember>
  today: string
}) {
  const crew = crewOf(day, attendees, team)
  return (
    <Link href={`/shoots/${day.id}`} className="row flex items-center gap-3 no-underline">
      <DateBlock date={day.date} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold">{day.title || 'Shoot day'}</span>
          {day.status !== 'planned' && <StatusBadge status={day.status} />}
          {day.second_start_time && <span className="chip chip-info">2 sessions</span>}
        </span>
        <span className="faint mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {day.status === 'planned' && <span className="text-ink-2">{relDay(day.date, today)}</span>}
          {(day.meeting_time || day.start_time) && (
            <span className="flex items-center gap-1">
              <Icon name="clock" size={13} />
              {fmtTime(day.meeting_time || day.start_time)}
            </span>
          )}
          {day.location_name && (
            <span className="flex min-w-0 items-center gap-1">
              <Icon name="pin" size={13} />
              <span className="truncate">{day.location_name}</span>
            </span>
          )}
        </span>
        <span className="mt-2 flex items-center gap-2">
          {crew.length ? (
            <AvatarStack people={crew.map((c) => ({ name: c.name, response: c.response }))} size={26} />
          ) : (
            <span className="faint">No crew yet</span>
          )}
        </span>
      </span>
      <Icon name="chevron" className="text-ink-3" />
    </Link>
  )
}

/** Accept, or decline with a reason. Shown to someone on the crew list. */
export function RespondBox({ dayId, current }: { dayId: string; current: Attendee['response'] }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {current !== 'accepted' && (
          <SmallAction
            action={respondToShoot}
            fields={{ id: dayId, accept: 'yes' }}
            variant="primary"
            small={false}
            label={
              <>
                <Icon name="check" size={16} /> Accept
              </>
            }
          />
        )}
        {current === 'accepted' && <span className="muted">You accepted. Plans changed?</span>}
      </div>
      {current !== 'declined' && (
        <details className="disclosure open:basis-full">
          <summary className={current === 'accepted' ? 'link text-sm' : 'btn btn-danger'}>
            {current === 'accepted' ? "I can't make it any more" : "I can't make it"}
          </summary>
          <ActionForm action={respondToShoot} className="space-y-2">
            <input type="hidden" name="id" value={dayId} />
            <input type="hidden" name="accept" value="no" />
            <label htmlFor={`why-${dayId}`}>Reason (only the manager sees this)</label>
            <textarea id={`why-${dayId}`} name="reason" rows={2} minLength={3} maxLength={500} required placeholder="e.g. I have an exam that morning" />
            <SubmitButton variant="danger">Decline this day</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  )
}
