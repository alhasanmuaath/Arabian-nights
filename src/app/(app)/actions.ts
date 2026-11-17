'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sendInvitation } from '@/lib/auth-mail'
import { testEmail } from '@/lib/emails'
import { describeMailError, mailConfigured, mailDnsCheck, mailSettingsText, sendMail } from '@/lib/mail'
import { originFromHeaders } from '@/lib/origin'
import { canEditAll, getMe } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionState, TargetType } from '@/lib/types'

// ---------- helpers ----------
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const num = (fd: FormData, k: string) => Number(fd.get(k))
const list = (fd: FormData, k: string) => [...new Set(fd.getAll(k).map(String).filter(Boolean))]
const NO = "You don't have permission to do that."

function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return NO
  if (/people_email_key|duplicate key.*email/i.test(message)) return 'Someone with that email is already on the team.'
  if (/shoot_attendees_shoot_day_id_person_id_key/.test(message)) return 'That person is already on the crew list.'
  if (/shoot_days_(location|meeting)_url_check/.test(message)) return 'The map link must start with https://'
  if (/hours_check/.test(message)) return 'Shoot hours must be more than 0 and at most 4.'
  if (/shoot_days_split_check/.test(message)) return 'The second session must start after the first ends, and both together can be at most 4 hours.'
  if (/comments_body_check/.test(message)) return 'Write a comment of up to 2000 characters.'
  return message
}

async function session() {
  const { supabase, me } = await getMe()
  if (!me) throw new Error('Not signed in.')
  return { supabase, me }
}

function done(ok: string): ActionState {
  revalidatePath('/', 'layout')
  return { ok }
}

/** "maps.app.goo.gl/x" -> "https://maps.app.goo.gl/x"; empty -> null. */
function cleanUrl(raw: string): string | null {
  if (!raw) return null
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

// =====================================================================
// SHOOT DAYS (manager)
// =====================================================================
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * Reads the shoot-day form. A split day (two sessions) stores the TOTAL in
 * `hours` and the second session in second_start_time / second_hours.
 */
function shootFields(fd: FormData) {
  const split = str(fd, 'split') === 'yes'
  const firstHours = num(fd, 'hours') || 4
  const secondHours = split ? num(fd, 'second_hours') : 0
  const start_time = str(fd, 'start_time') || null
  const second_start_time = split ? str(fd, 'second_start_time') || null : null

  let error: string | null = null
  if (split) {
    if (!start_time || !second_start_time) error = 'Enter a start time for both sessions.'
    else if (!(secondHours > 0) || !(firstHours > 0)) error = 'Both sessions need some hours.'
    else if (firstHours + secondHours > 4) error = 'Both sessions together can be at most 4 hours.'
    else if (minutes(second_start_time) < minutes(start_time) + firstHours * 60) {
      error = 'The second session must start after the first one ends.'
    }
  }

  return {
    error,
    date: str(fd, 'date'),
    title: str(fd, 'title') || null,
    start_time,
    hours: split ? firstHours + secondHours : firstHours,
    second_start_time,
    second_hours: split ? secondHours : null,
    videos_planned: Math.max(0, Math.floor(num(fd, 'videos_planned') || 0)),
    meeting_time: str(fd, 'meeting_time') || null,
    meeting_point: str(fd, 'meeting_point') || null,
    meeting_url: cleanUrl(str(fd, 'meeting_url')),
    meeting_instructions: str(fd, 'meeting_instructions') || null,
    location_name: str(fd, 'location_name') || null,
    location_address: str(fd, 'location_address') || null,
    location_url: cleanUrl(str(fd, 'location_url')),
    notes: str(fd, 'notes') || null,
  }
}

export async function createShoot(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { error: formError, ...fields } = shootFields(fd)
  if (formError) return { error: formError }
  if (!fields.date) return { error: 'Pick a date.' }

  const { data: day, error } = await supabase.from('shoot_days').insert(fields).select('id').single()
  if (error) return { error: friendly(error.message) }

  const crew = list(fd, 'person_ids')
  if (crew.length) {
    const { error: crewError } = await supabase
      .from('shoot_attendees')
      .insert(crew.map((person_id) => ({ shoot_day_id: day.id, person_id })))
    if (crewError) {
      revalidatePath('/', 'layout')
      return { error: `Shoot day created, but the crew was not added: ${friendly(crewError.message)}` }
    }
  }
  revalidatePath('/', 'layout')
  redirect(`/shoots/${day.id}`)
}

export async function updateShoot(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const status = str(fd, 'status')
  const { error: formError, ...fields } = shootFields(fd)
  if (formError) return { error: formError }
  const patch = { ...fields, ...(status ? { status } : {}) }
  const { data, error } = await supabase.from('shoot_days').update(patch).eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Saved.')
}

export async function setShootStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const status = str(fd, 'status')
  const { data, error } = await supabase.from('shoot_days').update({ status }).eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done(
    status === 'completed'
      ? 'Marked completed. Payments were added to Pay.'
      : status === 'cancelled'
        ? 'Shoot day cancelled. The crew was told.'
        : 'Shoot day is planned again.',
  )
}

export async function deleteShoot(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (!canEditAll(me)) return { error: NO }
  const id = str(fd, 'id')

  const { data: assets } = await supabase.from('shoot_assets').select('storage_path').eq('shoot_day_id', id)
  const { data, error } = await supabase.from('shoot_days').delete().eq('id', id).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }

  const paths = (assets ?? []).map((a) => a.storage_path).filter((p): p is string => Boolean(p))
  if (paths.length) await supabase.storage.from('shoot-assets').remove(paths)

  revalidatePath('/', 'layout')
  redirect('/shoots')
}

/** Organizers and the manager: where the shoot happens. */
export async function setLocation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { error } = await supabase.rpc('set_shoot_location', {
    day_id: str(fd, 'id'),
    loc_name: str(fd, 'location_name') || null,
    loc_address: str(fd, 'location_address') || null,
    loc_url: cleanUrl(str(fd, 'location_url')),
  })
  if (error) return { error: friendly(error.message) }
  return done('Location saved.')
}

// =====================================================================
// CREW
// =====================================================================
export async function addCrew(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const shoot_day_id = str(fd, 'shoot_day_id')
  const crew = list(fd, 'person_ids')
  if (!crew.length) return { error: 'Pick at least one person.' }
  const { error } = await supabase
    .from('shoot_attendees')
    .upsert(crew.map((person_id) => ({ shoot_day_id, person_id })), {
      onConflict: 'shoot_day_id,person_id',
      ignoreDuplicates: true,
    })
  if (error) return { error: friendly(error.message) }
  return done(`Added ${crew.length} ${crew.length === 1 ? 'person' : 'people'}. They were asked to accept.`)
}

export async function removeCrew(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('shoot_attendees').delete().eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Removed from this shoot day.')
}

/** Manager override, e.g. someone confirmed by phone. */
export async function setCrewResponse(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const response = str(fd, 'response')
  const { data, error } = await supabase
    .from('shoot_attendees')
    .update({ response, responded_at: response === 'pending' ? null : new Date().toISOString() })
    .eq('id', str(fd, 'id'))
    .select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Saved.')
}

/** Agreed fee for one person on one day. Empty = default (day rate for models). */
export async function setFee(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const shoot_day_id = str(fd, 'shoot_day_id')
  const person_id = str(fd, 'person_id')
  const raw = str(fd, 'amount')

  if (raw === '') {
    const { error } = await supabase.from('shoot_fees').delete().eq('shoot_day_id', shoot_day_id).eq('person_id', person_id)
    if (error) return { error: friendly(error.message) }
    return done('Fee cleared.')
  }
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Enter a valid amount.' }
  const { data, error } = await supabase
    .from('shoot_fees')
    .upsert({ shoot_day_id, person_id, amount, updated_at: new Date().toISOString() })
    .select('person_id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Fee saved.')
}

/** A crew member accepts, or declines with a reason. */
export async function respondToShoot(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const accept = str(fd, 'accept') === 'yes'
  const reason = str(fd, 'reason')
  if (!accept && reason.length < 3) return { error: 'Please write a short reason so the manager can plan.' }
  const { error } = await supabase.rpc('respond_to_shoot', { day_id: str(fd, 'id'), accept, reason: reason || null })
  if (error) return { error: friendly(error.message) }
  return done(accept ? 'Accepted. See you there.' : 'Declined. The manager was told.')
}

// =====================================================================
// PLACE PHOTOS + SCRIPTS
// =====================================================================
const ASSET_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/** Called by the browser after it has uploaded a file straight to storage. */
export async function registerAsset(input: {
  shoot_day_id: string
  kind: 'photo' | 'script'
  title: string
  storage_path: string
  mime_type: string
  size_bytes: number
}): Promise<ActionState> {
  const { supabase, me } = await session()
  const title = input.title.trim().slice(0, 150) || (input.kind === 'photo' ? 'Photo' : 'Script')
  const bad =
    !input.storage_path.startsWith(`${input.shoot_day_id}/`) ||
    !ASSET_TYPES.includes(input.mime_type) ||
    (input.kind === 'photo' && !input.mime_type.startsWith('image/'))

  const { error } = bad
    ? { error: { message: 'That file type is not allowed here.' } }
    : await supabase.from('shoot_assets').insert({
        shoot_day_id: input.shoot_day_id,
        kind: input.kind,
        title,
        storage_path: input.storage_path,
        mime_type: input.mime_type,
        size_bytes: input.size_bytes,
        uploaded_by: me.id,
      })

  if (error) {
    await supabase.storage.from('shoot-assets').remove([input.storage_path])
    return { error: friendly(error.message) }
  }
  revalidatePath('/', 'layout')
  return { ok: 'Uploaded.' }
}

export async function addTextScript(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const title = str(fd, 'title')
  const body = str(fd, 'body')
  if (!title || !body) return { error: 'Enter a title and the script text.' }
  const { error } = await supabase
    .from('shoot_assets')
    .insert({ shoot_day_id: str(fd, 'shoot_day_id'), kind: 'script', title, body, uploaded_by: me.id })
  if (error) return { error: friendly(error.message) }
  return done('Script added. The crew was told.')
}

export async function deleteAsset(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('shoot_assets').delete().eq('id', str(fd, 'id')).select('storage_path')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  if (data[0].storage_path) await supabase.storage.from('shoot-assets').remove([data[0].storage_path])
  return done('Removed.')
}

// =====================================================================
// COMMENTS + REVIEWED
// =====================================================================
const TARGETS: TargetType[] = ['announcement', 'file', 'asset']

export async function addComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const target_type = str(fd, 'type') as TargetType
  const body = str(fd, 'body')
  if (!TARGETS.includes(target_type)) return { error: 'Unknown item.' }
  if (!body) return { error: 'Write a comment first.' }
  const { error } = await supabase
    .from('comments')
    .insert({ target_type, target_id: str(fd, 'id'), person_id: me.id, body })
  if (error) return { error: friendly(error.message) }
  return done('Comment posted.')
}

export async function deleteComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('comments').delete().eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Comment deleted.')
}

export async function toggleReview(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const target_type = str(fd, 'type') as TargetType
  const target_id = str(fd, 'id')
  if (!TARGETS.includes(target_type)) return { error: 'Unknown item.' }

  const { data: removed, error: delError } = await supabase
    .from('reviews')
    .delete()
    .eq('target_type', target_type)
    .eq('target_id', target_id)
    .eq('person_id', me.id)
    .select('person_id')
  if (delError) return { error: friendly(delError.message) }
  if (removed?.length) return done('Review mark removed.')

  const { error } = await supabase.from('reviews').insert({ target_type, target_id, person_id: me.id })
  if (error) return { error: friendly(error.message) }
  return done('Marked as reviewed.')
}

// =====================================================================
// ANNOUNCEMENTS + SHARED FILES (manager)
// =====================================================================
/** Who an announcement or file is assigned to: everyone, or the ticked people. */
async function audience(
  supabase: Awaited<ReturnType<typeof session>>['supabase'],
  meId: string,
  everyone: boolean,
  picked: string[],
): Promise<string[]> {
  const { data } = await supabase.from('people').select('id')
  const all = (data ?? []).map((p) => p.id as string).filter((id) => id !== meId)
  return everyone ? all : picked.filter((id) => all.includes(id))
}

export async function createAnnouncement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (!canEditAll(me)) return { error: NO }

  const title = str(fd, 'title')
  const body = str(fd, 'body')
  if (!title || !body) return { error: 'Enter a title and a message.' }

  const recipients = await audience(supabase, me.id, str(fd, 'everyone') === 'yes', list(fd, 'person_ids'))
  if (!recipients.length) return { error: 'Choose who this is for: everyone, or tick at least one person.' }

  const { data: row, error } = await supabase
    .from('announcements')
    .insert({ title, body, created_by: me.id })
    .select('id')
    .single()
  if (error) return { error: friendly(error.message) }

  const { error: recipientError } = await supabase
    .from('announcement_recipients')
    .insert(recipients.map((person_id) => ({ announcement_id: row.id, person_id })))
  if (recipientError) {
    await supabase.from('announcements').delete().eq('id', row.id)
    return { error: friendly(recipientError.message) }
  }
  return done(`Published to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}.`)
}

export async function deleteAnnouncement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('announcements').delete().eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Announcement deleted.')
}

const FILE_TYPES = [
  ...ASSET_TYPES,
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/** Step 1 of sharing a file: reserve a record and a storage path. */
export async function createSharedFile(input: {
  name: string
  mime_type: string
  size_bytes: number
  description: string
}): Promise<{ id: string; path: string } | { error: string }> {
  const { supabase, me } = await session()
  if (!canEditAll(me)) return { error: NO }
  if (!FILE_TYPES.includes(input.mime_type)) {
    return { error: 'Allowed: PDF, Word, Excel, PowerPoint, text and images.' }
  }
  if (input.size_bytes > 15 * 1024 * 1024) return { error: 'The maximum file size is 15 MB.' }

  const id = crypto.randomUUID()
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document'
  const path = `${id}/${safeName}`
  const { error } = await supabase.from('shared_files').insert({
    id,
    name: input.name.slice(0, 200),
    description: input.description.trim().slice(0, 500) || null,
    storage_path: path,
    mime_type: input.mime_type,
    size_bytes: input.size_bytes,
    uploaded_by: me.id,
  })
  if (error) return { error: friendly(error.message) }
  return { id, path }
}

/** Step 2 (after the browser uploaded the file): assign it to people. */
export async function shareFile(input: { id: string; everyone: boolean; person_ids: string[] }): Promise<ActionState> {
  const { supabase, me } = await session()
  if (!canEditAll(me)) return { error: NO }
  const recipients = await audience(supabase, me.id, input.everyone, input.person_ids)
  if (recipients.length) {
    const { error } = await supabase
      .from('shared_file_recipients')
      .insert(recipients.map((person_id) => ({ file_id: input.id, person_id })))
    if (error) return { error: friendly(error.message) }
  }
  revalidatePath('/', 'layout')
  return { ok: `File shared with ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}.` }
}

/** Undo step 1 when the upload itself failed. */
export async function discardSharedFile(id: string): Promise<void> {
  const { supabase } = await session()
  await supabase.from('shared_files').delete().eq('id', id)
}

export async function deleteSharedFile(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (!canEditAll(me)) return { error: NO }
  const { data, error } = await supabase.from('shared_files').delete().eq('id', str(fd, 'id')).select('storage_path')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: 'File not found or permission denied.' }
  if (data[0].storage_path) await supabase.storage.from('shared-files').remove([data[0].storage_path])
  return done('File deleted.')
}

// =====================================================================
// TARGETS + PAY (manager)
// =====================================================================
export async function updateTargets(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase
    .from('targets')
    .update({
      target_hours: num(fd, 'target_hours'),
      target_videos: num(fd, 'target_videos'),
      target_days_min: num(fd, 'target_days_min'),
      target_days_max: num(fd, 'target_days_max'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
  if (error) {
    return { error: /targets_check/.test(error.message) ? 'Max days must be at least min days.' : friendly(error.message) }
  }
  if (!data?.length) return { error: NO }
  return done('Targets saved.')
}

export async function updateDayRate(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const day_rate = num(fd, 'day_rate')
  if (!(day_rate >= 0)) return { error: 'Enter a valid amount.' }
  const { data, error } = await supabase
    .from('targets')
    .update({ day_rate, currency: str(fd, 'currency') || 'EGP', updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }

  if (fd.get('apply_unpaid')) {
    const { data: models } = await supabase.from('people').select('id').eq('role', 'model')
    const { error: e2 } = await supabase
      .from('pay')
      .update({ amount: day_rate })
      .eq('status', 'not_paid')
      .in('person_id', (models ?? []).map((p) => p.id))
    if (e2) return { error: friendly(e2.message) }
    return done('Day rate saved and applied to unpaid model days.')
  }
  return done('Day rate saved. It applies to days completed from now on.')
}

export async function updatePay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const patch: Record<string, unknown> = {}
  if (fd.has('amount')) patch.amount = num(fd, 'amount')
  if (fd.has('status')) patch.status = str(fd, 'status')
  const { data, error } = await supabase.from('pay').update(patch).eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done(patch.status === 'paid' ? 'Marked paid.' : patch.status === 'not_paid' ? 'Marked not paid.' : 'Saved.')
}

// =====================================================================
// PEOPLE (manager)
// =====================================================================
const ROLES = ['model', 'photographer', 'organizer', 'manager', 'member']

async function sendInvite(email: string): Promise<string> {
  return sendInvitation(email, originFromHeaders(await headers()))
}

export async function invitePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can invite people.' }

  const email = str(fd, 'email').toLowerCase()
  const name = str(fd, 'name')
  const role = str(fd, 'role')
  if (!name || !email.includes('@')) return { error: 'Enter a name and a valid email.' }
  if (!ROLES.includes(role)) return { error: 'Invalid role selected.' }

  const { error } = await supabase.from('people').insert({ name, email, role })
  if (error) return { error: friendly(error.message) }
  return done(`${name} added.${await sendInvite(email)}`)
}

export async function resendInvite(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can invite people.' }
  return { ok: (await sendInvite(str(fd, 'email'))).trim() }
}

export async function updatePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can update team members.' }

  const id = str(fd, 'id')
  const role = str(fd, 'role')
  const name = str(fd, 'name')
  if (!id || !name) return { error: 'Enter a name.' }
  if (!ROLES.includes(role)) return { error: 'Invalid role selected.' }
  if (id === me.id && role !== 'manager') return { error: "You can't remove your own manager role." }

  const { data, error } = await supabase.from('people').update({ name, role }).eq('id', id).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  return done('Saved.')
}

export async function removePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const id = str(fd, 'id')
  if (id === me.id) return { error: "You can't remove yourself." }
  const { data, error } = await supabase.from('people').delete().eq('id', id).select('user_id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: NO }
  // also delete their login so they can't sign in again
  const userId = data[0].user_id as string | null
  const admin = createAdminClient()
  if (userId && admin) await admin.auth.admin.deleteUser(userId)
  return done('Removed from the team.')
}

// =====================================================================
// NOTIFICATIONS
// =====================================================================
export async function markNotificationRead(id: string) {
  const { supabase, me } = await session()
  await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('person_id', me.id)
  revalidatePath('/', 'layout')
}

export async function markAllNotificationsRead() {
  const { supabase, me } = await session()
  await supabase.from('notifications').update({ is_read: true }).eq('person_id', me.id).eq('is_read', false)
  revalidatePath('/', 'layout')
}

// ---------- email check (manager) ----------
/** Sends a test email to the manager and reports exactly what the mail server said. */
export async function sendTestEmail(): Promise<ActionState> {
  const { me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can do this.' }
  if (!mailConfigured()) {
    return {
      error:
        'The app has no mail settings, so Supabase sends the emails (with the templates saved in the Supabase dashboard). Add SMTP_HOST and SMTP_FROM in Vercel (and SMTP_USER, SMTP_PASS, SMTP_PORT), then redeploy.',
    }
  }
  try {
    await sendMail(me.email, testEmail())
  } catch (e) {
    return { error: `The mail server refused it: ${describeMailError(e)}. Settings the app sees: ${mailSettingsText()}.` }
  }
  const domain = (process.env.SMTP_FROM ?? '').match(/@([^>\s]+)/)?.[1] ?? ''
  const dns = domain ? await mailDnsCheck(domain) : null
  const mark = (ok: boolean) => (ok ? 'found' : 'MISSING')
  return {
    ok:
      `Test email sent to ${me.email} and accepted by the mail server. Check your inbox and spam folder. ` +
      `Settings: ${mailSettingsText()}.` +
      (dns
        ? ` Domain records for ${domain}: SPF ${mark(dns.spf)}${dns.spf && !dns.spfPrivate ? ' (but it does not include spf.privateemail.com)' : ''}, DKIM ${mark(dns.dkim)}, DMARC ${mark(dns.dmarc)}.`
        : ''),
  }
}
