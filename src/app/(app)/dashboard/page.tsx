import Link from 'next/link'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { ProgressBar } from '@/components/ProgressBar'
import { DateBlock, RespondBox, ShootRow, crewOf } from '@/components/ShootBits'
import { StatusBadge } from '@/components/StatusBadge'
import { getTeam } from '@/lib/data'
import { cairoHour, cairoToday, fmtDateLong, fmtStamp, fmtTime, relDay, sessionsLabel } from '@/lib/dates'
import { ROLE_LABEL, getSupabase, getTargets, requireRole } from '@/lib/session'
import type { Attendee, ShootDay, Targets, TeamMember } from '@/lib/types'
import { updateTargets } from '../actions'

type Reason = { attendee_id: string; reason: string }
type News = { id: string; title: string; body: string; created_at: string }

export default async function Dashboard() {
  const supabase = await getSupabase()
  const today = cairoToday()

  // Everything starts at once. Row-level security decides what each person gets back.
  const [{ me }, targets, team, daysRes, crewRes, newsRes, reasonsRes] = await Promise.all([
    requireRole(),
    getTargets(),
    getTeam(supabase),
    supabase.from('shoot_days').select('*').order('date').order('start_time'),
    supabase.from('shoot_attendees').select('*'),
    supabase.from('announcements').select('id, title, body, created_at').order('created_at', { ascending: false }).limit(3),
    supabase.from('shoot_decline_reasons').select('attendee_id, reason'),
  ])
  const isManager = me.role === 'manager'
  const days = (daysRes.data ?? []) as ShootDay[]
  const attendees = (crewRes.data ?? []) as Attendee[]
  const news = (newsRes.data ?? []) as News[]
  const reasons = new Map(((reasonsRes.data ?? []) as Reason[]).map((r) => [r.attendee_id, r.reason]))

  const upcoming = days.filter((d) => d.status === 'planned' && d.date >= today)
  const next = upcoming[0]
  const later = upcoming.slice(1, 6)
  const upcomingIds = new Set(upcoming.map((d) => d.id))

  // what I still have to answer
  const mine = attendees.filter((a) => a.person_id === me.id && upcomingIds.has(a.shoot_day_id))
  const toAnswer = mine
    .filter((a) => a.response === 'pending' && a.shoot_day_id !== next?.id)
    .map((a) => ({ a, day: upcoming.find((d) => d.id === a.shoot_day_id)! }))
  const myNext = next ? mine.find((a) => a.shoot_day_id === next.id) : undefined

  // season numbers
  const live = days.filter((d) => d.status !== 'cancelled')
  const completed = live.filter((d) => d.status === 'completed')
  const hours = live.reduce((t, d) => t + Number(d.hours), 0)
  const videos = live.reduce((t, d) => t + d.videos_planned, 0)

  // manager: who has not answered, who declined
  const open = attendees.filter((a) => upcomingIds.has(a.shoot_day_id))
  const waiting = open.filter((a) => a.response === 'pending')
  const declined = open.filter((a) => a.response === 'declined')

  const hour = cairoHour()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{fmtDateLong(today)}</p>
          <h1 className="mt-1">
            {greeting}, {me.name.split(' ')[0]}
          </h1>
        </div>
        <span className="chip chip-role">{ROLE_LABEL[me.role]}</span>
      </header>

      {toAnswer.length > 0 && (
        <section className="glass glass-pad space-y-4 border-wait/40">
          <div className="flex items-center gap-2">
            <Icon name="flag" className="text-wait" />
            <h2>Also waiting for your answer</h2>
          </div>
          {toAnswer.map(({ a, day }) => (
            <div key={a.id} className="row space-y-3">
              <Link href={`/shoots/${day.id}`} className="flex items-center gap-3 no-underline">
                <DateBlock date={day.date} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{day.title || 'Shoot day'}</span>
                  <span className="faint block">
                    {relDay(day.date, today)}
                    {(day.meeting_time || day.start_time) && ` · ${fmtTime(day.meeting_time || day.start_time)}`}
                    {day.location_name && ` · ${day.location_name}`}
                  </span>
                </span>
              </Link>
              <RespondBox dayId={day.id} current={a.response} />
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          {next ? (
            <NextShoot day={next} attendees={attendees} team={team} today={today} myResponse={myNext?.response} />
          ) : (
            <section className="glass glass-hero glass-pad">
              <p className="eyebrow">Next shoot</p>
              <h2 className="mt-2">Nothing planned yet</h2>
              <p className="muted mt-1">
                {isManager ? 'Add the next shoot day and pick who should be there.' : 'The manager will add the next shoot day here.'}
              </p>
              {isManager && (
                <Link href="/shoots#new" className="btn btn-primary mt-4">
                  <Icon name="plus" size={16} /> New shoot day
                </Link>
              )}
            </section>
          )}

          <section className="glass glass-pad">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2>Coming up</h2>
              <Link href="/shoots" className="link text-sm">
                All shoot days
              </Link>
            </div>
            {later.length ? (
              <div className="space-y-2.5">
                {later.map((d) => (
                  <ShootRow key={d.id} day={d} attendees={attendees} team={team} today={today} />
                ))}
              </div>
            ) : (
              <p className="muted">{next ? 'No other shoot days planned after this one.' : 'No shoot days planned.'}</p>
            )}
          </section>

          {isManager && (waiting.length > 0 || declined.length > 0) && (
            <section className="glass glass-pad space-y-4">
              <h2>Crew answers</h2>
              {declined.length > 0 && (
                <div>
                  <p className="faint mb-2">Declined</p>
                  <ul className="space-y-2">
                    {declined.map((a) => {
                      const day = upcoming.find((d) => d.id === a.shoot_day_id)!
                      const name = team.get(a.person_id)?.name ?? 'Someone'
                      return (
                        <li key={a.id}>
                          <Link href={`/shoots/${day.id}`} className="row flex gap-3 no-underline">
                            <Avatar name={name} size={34} response="declined" />
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {name} · {relDay(day.date, today).toLowerCase()}
                              </span>
                              <span className="muted block">{reasons.get(a.id) ?? 'No reason given'}</span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {waiting.length > 0 && (
                <div>
                  <p className="faint mb-2">No answer yet</p>
                  <div className="flex flex-wrap gap-2">
                    {waiting.map((a) => {
                      const day = upcoming.find((d) => d.id === a.shoot_day_id)!
                      return (
                        <Link key={a.id} href={`/shoots/${day.id}`} className="chip chip-wait no-underline">
                          {team.get(a.person_id)?.name ?? 'Someone'} · {relDay(day.date, today).toLowerCase()}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="glass glass-pad space-y-4">
            <h2>Season so far</h2>
            <ProgressBar
              label="Shoot days"
              value={live.length}
              target={targets.target_days_max}
              note={`${completed.length} completed · ${live.length - completed.length} still to come · goal ${targets.target_days_min}–${targets.target_days_max}`}
            />
            <ProgressBar label="Videos planned" value={videos} target={targets.target_videos} />
            <ProgressBar label="Shoot hours" value={hours} target={Number(targets.target_hours)} unit=" h" />
            {isManager && <TargetsForm targets={targets} />}
          </section>

          <section className="glass glass-pad">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2>Latest news</h2>
              <Link href="/announcements" className="link text-sm">
                All news
              </Link>
            </div>
            {news.length ? (
              <ul className="space-y-2.5">
                {news.map((n) => (
                  <li key={n.id}>
                    <Link href={`/announcements#a-${n.id}`} className="row block no-underline">
                      <span className="block font-medium">{n.title}</span>
                      <span className="muted mt-0.5 line-clamp-2 block">{n.body}</span>
                      <span className="faint mt-1 block">{fmtStamp(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No announcements yet.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

function NextShoot({
  day,
  attendees,
  team,
  today,
  myResponse,
}: {
  day: ShootDay
  attendees: Attendee[]
  team: Map<string, TeamMember>
  today: string
  myResponse?: Attendee['response']
}) {
  const crew = crewOf(day, attendees, team)
  const coming = crew.filter((c) => c.response !== 'declined')
  return (
    <section className="glass glass-hero glass-pad">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Next shoot · {relDay(day.date, today)}</p>
        {myResponse && <StatusBadge status={myResponse} label={myResponse === 'accepted' ? "You're in" : undefined} />}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <DateBlock date={day.date} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-[1.375rem] leading-tight">{day.title || 'Shoot day'}</h2>
          <p className="muted">{fmtDateLong(day.date)}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <div className="row flex items-start gap-2.5">
          <Icon name="clock" className="mt-0.5 text-gold-300" />
          <div className="min-w-0">
            <dt className="faint">Meet</dt>
            <dd className="font-medium">
              {day.meeting_time ? fmtTime(day.meeting_time) : 'Time to be confirmed'}
              {day.meeting_point && <span className="muted block font-normal">{day.meeting_point}</span>}
              {day.meeting_instructions && <span className="faint mt-0.5 block font-normal">Instructions inside</span>}
            </dd>
          </div>
        </div>
        <div className="row flex items-start gap-2.5">
          <Icon name="pin" className="mt-0.5 text-gold-300" />
          <div className="min-w-0">
            <dt className="faint">Location</dt>
            <dd className="font-medium">
              {day.location_name || 'To be confirmed'}
              {day.start_time && <span className="muted block font-normal">Shooting {sessionsLabel(day)}</span>}
            </dd>
          </div>
        </div>
      </dl>

      <div className="mt-4">
        <p className="faint mb-2">Who will be there ({coming.length})</p>
        {crew.length ? (
          <ul className="flex flex-wrap gap-2">
            {crew.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-full border border-white/12 bg-white/6 py-1 pl-1 pr-3 text-sm ${
                  c.response === 'declined' ? 'text-ink-3 line-through' : ''
                }`}
              >
                <Avatar name={c.name} size={26} response={c.response} />
                {c.name.split(' ')[0]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">The crew has not been picked yet.</p>
        )}
      </div>

      {myResponse === 'pending' && (
        <div className="mt-5 rounded-2xl border border-gold-300/40 bg-night-950/35 p-4">
          <p className="mb-3 flex items-center gap-2 font-semibold">
            <Icon name="flag" size={16} className="text-wait" /> Will you be there?
          </p>
          <RespondBox dayId={day.id} current={myResponse} />
        </div>
      )}

      <Link href={`/shoots/${day.id}`} className={`btn mt-5 w-full sm:w-auto ${myResponse === 'pending' ? '' : 'btn-primary'}`}>
        Open shoot day
        <Icon name="chevron" size={16} />
      </Link>
    </section>
  )
}

function TargetsForm({ targets }: { targets: Targets }) {
  return (
    <details className="disclosure">
      <summary className="link text-sm">Edit goals</summary>
      <ActionForm action={updateTargets} className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="target_days_min">Days (min)</label>
          <input id="target_days_min" name="target_days_min" type="number" min={0} defaultValue={targets.target_days_min} required />
        </div>
        <div>
          <label htmlFor="target_days_max">Days (max)</label>
          <input id="target_days_max" name="target_days_max" type="number" min={0} defaultValue={targets.target_days_max} required />
        </div>
        <div>
          <label htmlFor="target_videos">Videos</label>
          <input id="target_videos" name="target_videos" type="number" min={0} defaultValue={targets.target_videos} required />
        </div>
        <div>
          <label htmlFor="target_hours">Hours</label>
          <input id="target_hours" name="target_hours" type="number" min={0} step={0.5} defaultValue={targets.target_hours} required />
        </div>
        <div className="col-span-2">
          <SubmitButton small>Save goals</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}
