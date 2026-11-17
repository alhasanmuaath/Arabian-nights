import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { AssetUploader } from '@/components/AssetUploader'
import { PeopleChecklist } from '@/components/AudiencePicker'
import { Avatar } from '@/components/Avatar'
import { Feedback } from '@/components/Feedback'
import { Icon } from '@/components/Icon'
import { DateBlock, RespondBox, crewOf } from '@/components/ShootBits'
import { ShootForm } from '@/components/ShootForm'
import { SmallAction } from '@/components/SmallAction'
import { StatusBadge } from '@/components/StatusBadge'
import { getFeedback, getTeam, signUrls } from '@/lib/data'
import { cairoToday, fmtDateLong, fmtHours, fmtSize, fmtStamp, fmtTime, relDay, seasonDates, sessionsOf } from '@/lib/dates'
import { ROLE_LABEL, canEditAll, canEditLocation, getSupabase, getTargets, requireRole } from '@/lib/session'
import type { Asset, Attendee, ShootDay } from '@/lib/types'
import {
  addCrew,
  addTextScript,
  deleteAsset,
  deleteShoot,
  removeCrew,
  setCrewResponse,
  setFee,
  setLocation,
  setShootStatus,
} from '../../actions'

type Reason = { attendee_id: string; reason: string }
type Fee = { person_id: string; amount: number }

export default async function ShootPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const today = cairoToday()

  // One round of queries, all at once. Row-level security decides what each person gets back.
  const [{ me }, dayRes, targets, team, crewRes, assetsRes, reasonsRes, feesRes] = await Promise.all([
    requireRole(),
    supabase.from('shoot_days').select('*').eq('id', id).maybeSingle<ShootDay>(),
    getTargets(),
    getTeam(supabase),
    supabase.from('shoot_attendees').select('*').eq('shoot_day_id', id),
    supabase.from('shoot_assets').select('*').eq('shoot_day_id', id).order('created_at'),
    supabase.from('shoot_decline_reasons').select('attendee_id, reason'),
    supabase.from('shoot_fees').select('person_id, amount').eq('shoot_day_id', id),
  ])
  if (!dayRes.data) notFound()
  const day = dayRes.data
  const isManager = me.role === 'manager'
  const canEdit = canEditAll(me)
  const canPlace = canEditLocation(me)
  const attendees = (crewRes.data ?? []) as Attendee[]
  const assets = (assetsRes.data ?? []) as Asset[]
  const reasons = new Map(((reasonsRes.data ?? []) as Reason[]).map((r) => [r.attendee_id, r.reason]))
  const fees = new Map(((feesRes.data ?? []) as Fee[]).map((f) => [f.person_id, Number(f.amount)]))

  const photos = assets.filter((a) => a.kind === 'photo')
  const scripts = assets.filter((a) => a.kind === 'script')
  const [urls, feedback] = await Promise.all([
    signUrls(supabase, 'shoot-assets', assets.map((a) => a.storage_path).filter((p): p is string => Boolean(p))),
    getFeedback(supabase, 'asset', assets.map((a) => a.id)),
  ])

  const crew = crewOf(day, attendees, team)
  const mine = crew.find((c) => c.person_id === me.id)
  const coming = crew.filter((c) => c.response !== 'declined').length
  const notOnCrew = [...team.values()].filter((p) => p.role !== 'manager' && !crew.some((c) => c.person_id === p.id))
  const hasPlace = day.location_name || day.location_address || day.location_url

  const fb = (assetId: string) => ({
    type: 'asset' as const,
    id: assetId,
    comments: feedback.comments.get(assetId) ?? [],
    reviews: feedback.reviews.get(assetId) ?? [],
    team,
    meId: me.id,
    isManager,
  })

  return (
    <>
      <Link href="/shoots" transitionTypes={['drill-out']} className="link inline-flex items-center gap-1 text-sm">
        <Icon name="chevron" size={14} className="rotate-180" /> All shoot days
      </Link>

      {/* ---------- header ---------- */}
      <section className="glass glass-hero glass-pad" data-tilt>
        <div className="flex items-start gap-4">
          <DateBlock date={day.date} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">{day.status === 'planned' ? relDay(day.date, today) : fmtDateLong(day.date)}</p>
              <StatusBadge status={day.status} />
            </div>
            <h1 className="mt-1 break-words">{day.title || 'Shoot day'}</h1>
            <p className="muted">{fmtDateLong(day.date)}</p>
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {sessionsOf(day).map((s, i, all) => (
            <li key={i} className="chip">
              <Icon name="clock" size={13} /> {all.length > 1 ? `Session ${i + 1}: ` : 'Shooting '}
              {s.start}–{s.end}
            </li>
          ))}
          <li className="chip">
            {fmtHours(day.hours)}
            {day.second_start_time ? ' in total' : ''}
          </li>
          <li className="chip">
            <Icon name="video" size={13} /> {day.videos_planned} video{day.videos_planned === 1 ? '' : 's'}
          </li>
          <li className="chip">
            <Icon name="users" size={13} /> {coming} coming
          </li>
        </ul>

        {day.notes && <p className="prose-plain mt-4">{day.notes}</p>}

        {mine && day.status === 'planned' && (
          <div className="mt-5 rounded-2xl border border-white/14 bg-night-950/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold">Your answer</span>
              <StatusBadge status={mine.response} />
            </div>
            {mine.response === 'declined' && reasons.get(mine.id) && (
              <p className="muted mb-3">Your reason: {reasons.get(mine.id)}</p>
            )}
            <RespondBox dayId={day.id} current={mine.response} />
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- meeting ---------- */}
        <section className="glass glass-pad">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="clock" className="text-gold-300" />
            <h2>Meeting point &amp; time</h2>
          </div>
          {day.meeting_time || day.meeting_point || day.meeting_url || day.meeting_instructions ? (
            <>
              <p className="num text-3xl font-bold tracking-tight">{day.meeting_time ? fmtTime(day.meeting_time) : '—'}</p>
              <p className="faint">Cairo time</p>
              {day.meeting_point && <p className="mt-2 text-[15px] font-medium">{day.meeting_point}</p>}
              {day.meeting_url && (
                <a href={day.meeting_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm mt-3">
                  <Icon name="pin" size={15} /> Open meeting spot in Maps
                </a>
              )}
              {day.meeting_instructions && (
                <div className="mt-4 rounded-2xl border border-white/12 bg-night-950/30 p-3.5">
                  <p className="eyebrow mb-1.5">Instructions</p>
                  <p dir="auto" className="prose-plain text-ink">
                    {day.meeting_instructions}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="muted">The manager has not set the meeting point yet.</p>
          )}
        </section>

        {/* ---------- location ---------- */}
        <section className="glass glass-pad">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="pin" className="text-gold-300" />
            <h2>Location</h2>
          </div>
          {hasPlace ? (
            <>
              {day.location_name && <p className="text-lg font-semibold">{day.location_name}</p>}
              {day.location_address && <p className="muted mt-0.5">{day.location_address}</p>}
              {day.location_url && (
                <a href={day.location_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm mt-3">
                  <Icon name="pin" size={15} /> Open in Maps
                </a>
              )}
            </>
          ) : (
            <p className="muted">No location yet.{canPlace ? ' Add it below.' : ''}</p>
          )}
          {canPlace && (
            <details className="disclosure mt-4">
              <summary className="link text-sm">{hasPlace ? 'Change location' : 'Add location'}</summary>
              <ActionForm action={setLocation} className="space-y-3">
                <input type="hidden" name="id" value={day.id} />
                <div>
                  <label htmlFor="loc-name">Place</label>
                  <input id="loc-name" name="location_name" maxLength={150} defaultValue={day.location_name ?? ''} />
                </div>
                <div>
                  <label htmlFor="loc-addr">Address / directions</label>
                  <input id="loc-addr" name="location_address" maxLength={300} defaultValue={day.location_address ?? ''} />
                </div>
                <div>
                  <label htmlFor="loc-url">Google Maps link</label>
                  <input id="loc-url" name="location_url" inputMode="url" maxLength={500} defaultValue={day.location_url ?? ''} placeholder="https://maps.app.goo.gl/…" />
                </div>
                <SubmitButton small>Save location</SubmitButton>
              </ActionForm>
            </details>
          )}
        </section>
      </div>

      {/* ---------- place photos ---------- */}
      <section className="glass glass-pad">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="image" className="text-gold-300" />
          <h2>Pictures of the place ({photos.length})</h2>
        </div>
        {photos.length === 0 && <p className="muted">No photos yet.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((p) => {
            const url = p.storage_path ? urls.get(p.storage_path) : undefined
            return (
              <li key={p.id} className="row p-2.5">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
                    <img src={url} alt={p.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </a>
                ) : (
                  <div className="faint flex aspect-[4/3] items-center justify-center rounded-xl bg-white/5">Photo unavailable</div>
                )}
                <div className="mt-2 flex items-start justify-between gap-2 px-1">
                  <p className="faint min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                    {team.get(p.uploaded_by)?.name ?? 'Someone'} · {fmtStamp(p.created_at)}
                  </p>
                  {(canEdit || (canPlace && p.uploaded_by === me.id)) && (
                    <SmallAction action={deleteAsset} fields={{ id: p.id }} label="Remove" variant="danger" />
                  )}
                </div>
                <div className="px-1">
                  <Feedback {...fb(p.id)} />
                </div>
              </li>
            )
          })}
        </ul>
        {canPlace && (
          <details className="disclosure mt-4">
            <summary className="btn btn-sm">
              <Icon name="camera" size={15} /> Add photos
            </summary>
            <AssetUploader shootDayId={day.id} kind="photo" />
          </details>
        )}
      </section>

      {/* ---------- scripts ---------- */}
      <section className="glass glass-pad">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="script" className="text-gold-300" />
          <h2>Scripts ({scripts.length})</h2>
        </div>
        {scripts.length === 0 && <p className="muted">No scripts yet.</p>}
        <ul className="space-y-3">
          {scripts.map((s) => {
            const url = s.storage_path ? urls.get(s.storage_path) : undefined
            return (
              <li key={s.id} className="row">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words">{s.title}</h3>
                    <p className="faint">
                      {team.get(s.uploaded_by)?.name ?? 'Someone'} · {fmtStamp(s.created_at)}
                      {s.size_bytes ? ` · ${fmtSize(s.size_bytes)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                        <Icon name="download" size={15} /> Open file
                      </a>
                    )}
                    {canEdit && <SmallAction action={deleteAsset} fields={{ id: s.id }} label="Remove" variant="danger" />}
                  </div>
                </div>
                {s.body && (
                  <details className="disclosure mt-2" open={s.body.length < 600}>
                    <summary className="link text-sm">Read script</summary>
                    <p dir="auto" className="prose-plain rounded-xl bg-night-950/35 p-3 text-ink">
                      {s.body}
                    </p>
                  </details>
                )}
                <Feedback {...fb(s.id)} />
              </li>
            )
          })}
        </ul>
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <details className="disclosure w-full">
              <summary className="btn btn-sm">
                <Icon name="edit" size={15} /> Write a script
              </summary>
              <ActionForm action={addTextScript} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="shoot_day_id" value={day.id} />
                <div>
                  <label htmlFor="script-title">Title</label>
                  <input id="script-title" name="title" maxLength={150} required placeholder="e.g. Video 3 – Sara" />
                </div>
                <div>
                  <label htmlFor="script-body">Script</label>
                  <textarea id="script-body" name="body" dir="auto" rows={8} maxLength={20000} required placeholder="Paste or type the script (Arabic or English)" />
                </div>
                <SubmitButton small>Add script</SubmitButton>
              </ActionForm>
            </details>
            <details className="disclosure w-full">
              <summary className="btn btn-sm">
                <Icon name="upload" size={15} /> Upload a script file
              </summary>
              <AssetUploader shootDayId={day.id} kind="script" />
            </details>
          </div>
        )}
      </section>

      {/* ---------- crew ---------- */}
      <section className="glass glass-pad">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="users" className="text-gold-300" />
          <h2>Who will be there ({coming})</h2>
        </div>
        {crew.length === 0 && <p className="muted">The crew has not been picked yet.</p>}
        <ul className="space-y-2.5">
          {crew.map((c) => (
            <li key={c.id} className="row">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size={40} response={c.response} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.name} {c.person_id === me.id && <span className="faint">(you)</span>}
                  </p>
                  <p className="faint">{ROLE_LABEL[c.role]}</p>
                </div>
                <StatusBadge status={c.response} />
              </div>
              {c.response === 'declined' && reasons.get(c.id) && (isManager || c.person_id === me.id) && (
                <p className="muted mt-2 rounded-xl bg-no/10 px-3 py-2">
                  <span className="font-medium text-no">Reason:</span> {reasons.get(c.id)}
                </p>
              )}
              {canEdit && (
                <details className="disclosure mt-2">
                  <summary className="link text-sm">Manage</summary>
                  <div className="flex flex-wrap items-end gap-2">
                    <ActionForm action={setCrewResponse} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <div>
                        <label htmlFor={`r-${c.id}`}>Answer</label>
                        <select id={`r-${c.id}`} name="response" defaultValue={c.response} className="w-40">
                          <option value="pending">No answer yet</option>
                          <option value="accepted">Accepted</option>
                          <option value="declined">Declined</option>
                        </select>
                      </div>
                      <SubmitButton variant="secondary" small>
                        Set
                      </SubmitButton>
                    </ActionForm>
                    {isManager && (
                      <ActionForm action={setFee} className="flex items-end gap-2">
                        <input type="hidden" name="shoot_day_id" value={day.id} />
                        <input type="hidden" name="person_id" value={c.person_id} />
                        <div>
                          <label htmlFor={`f-${c.id}`}>Agreed fee ({targets.currency})</label>
                          <input
                            id={`f-${c.id}`}
                            name="amount"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={fees.get(c.person_id) ?? ''}
                            placeholder={c.role === 'model' ? `${targets.day_rate} (day rate)` : 'none'}
                            className="w-40"
                          />
                        </div>
                        <SubmitButton variant="secondary" small>
                          Save fee
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <SmallAction action={removeCrew} fields={{ id: c.id }} label="Remove" variant="danger" />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {canEdit && notOnCrew.length > 0 && (
          <details className="disclosure mt-4">
            <summary className="btn btn-sm">
              <Icon name="plus" size={15} /> Add people
            </summary>
            <ActionForm action={addCrew} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="shoot_day_id" value={day.id} />
              <PeopleChecklist people={notOnCrew} />
              <SubmitButton small>Add to this day</SubmitButton>
            </ActionForm>
          </details>
        )}
      </section>

      {/* ---------- manager ---------- */}
      {canEdit && (
        <section className="glass glass-pad space-y-4">
          <h2>Manage this shoot day</h2>
          <div className="flex flex-wrap gap-2">
            {day.status !== 'completed' && (
              <SmallAction action={setShootStatus} fields={{ id: day.id, status: 'completed' }} variant="primary" small={false} label="Mark completed" />
            )}
            {day.status !== 'planned' && (
              <SmallAction action={setShootStatus} fields={{ id: day.id, status: 'planned' }} small={false} label="Back to planned" />
            )}
            {day.status === 'planned' && (
              <SmallAction action={setShootStatus} fields={{ id: day.id, status: 'cancelled' }} variant="danger" small={false} label="Cancel this day" />
            )}
          </div>
          <p className="faint">
            Completing a day adds a payment for each model who did not decline (day rate, or the agreed fee) and for anyone with an agreed fee.
          </p>
          <details className="disclosure">
            <summary className="btn btn-sm">
              <Icon name="edit" size={15} /> Edit details
            </summary>
            <ShootForm dates={seasonDates(targets.season_start, targets.season_end)} day={day} />
          </details>
          <details className="disclosure">
            <summary className="link text-sm text-no">Delete this shoot day</summary>
            <p className="muted mb-2">This removes the day, its crew list, photos, scripts and unpaid payments. It cannot be undone.</p>
            <SmallAction action={deleteShoot} fields={{ id: day.id }} label="Yes, delete it" variant="danger" />
          </details>
        </section>
      )}
    </>
  )
}
