'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getMe, canEditAll } from '@/lib/session'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '@/lib/supabase/env'
import type { ActionState } from '@/lib/types'

// ---------- helpers ----------
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const num = (fd: FormData, k: string) => Number(fd.get(k))

function friendly(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that."
  if (/people_email_key|duplicate key.*email/i.test(message)) return 'Someone with that email is already on the team.'
  if (/shoot_days_one_per_person_per_date/.test(message)) return 'That person already has a shoot day on this date.'
  if (/availability_check|end_time > start_time/.test(message)) return 'End time must be after start time.'
  if (/hours_check/.test(message)) return 'Shoot day hours must be more than 0 and at most 4.';
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

// ---------- availability ----------

export async function addAvailability(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()

  const person_id = str(fd, 'person_id') || me.id
  const dates = fd.getAll('dates').map(String).filter(Boolean)

  const start_time = str(fd, 'start_time')
  const end_time = str(fd, 'end_time')
  const second_start = str(fd, 'second_start')
  const second_end = str(fd, 'second_end')

  if (!dates.length) return { error: 'Pick at least one date.' }

  if (!start_time || !end_time || end_time <= start_time) {
    return { error: 'Enter a valid first time window.' }
  }

  if (Boolean(second_start) !== Boolean(second_end)) {
    return { error: 'Complete both times for the second window.' }
  }

  if (second_start && second_end && second_end <= second_start) {
    return { error: 'End time must be after the second start time.' }
  }

  if (second_start && second_start < end_time) {
    return { error: 'The second window must start after the first window ends.' }
  }

  const windows = [
    { start_time, end_time },
    ...(second_start && second_end
      ? [{ start_time: second_start, end_time: second_end }]
      : []),
  ]

  const failed: string[] = []

  for (const date of dates) {
    for (const window of windows) {
      const { error } = await supabase
        .from('availability')
        .insert({ person_id, date, ...window })

      if (error) {
        failed.push(`${date} (${window.start_time}–${window.end_time}): ${friendly(error.message)}`)
        break
      }
    }
  }

  revalidatePath('/', 'layout')

  const added = dates.length - new Set(failed.map((f) => f.split(' ')[0])).size

  if (failed.length) {
    return { error: `Added windows for ${added} of ${dates.length} dates. ${failed.join(' · ')}` }
  }

  return {
    ok: `Added ${windows.length} window${windows.length === 1 ? '' : 's'} on ${dates.length} date${dates.length === 1 ? '' : 's'}.`,
  }
}




export async function updateAvailability(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()

  const id = str(fd, 'id')
  const date = str(fd, 'date')
  const start_time = str(fd, 'start_time')
  const end_time = str(fd, 'end_time')

  if (!id || !date || !start_time || !end_time) {
    return { error: 'Complete all availability fields.' }
  }

  if (end_time <= start_time) {
    return { error: 'End time must be after start time.' }
  }

  const { data, error } = await supabase
    .from('availability')
    .update({ date, start_time, end_time })
    .eq('id', id)
    .select('id')

  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }

  revalidatePath('/', 'layout')
  return done('Availability updated. It may require approval again.')
}

export async function deleteAvailability(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()

  const { data, error } = await supabase
    .from('availability')
    .delete()
    .eq('id', str(fd, 'id'))
    .select('id')

  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }

  revalidatePath('/', 'layout')
  return done('Removed.')
}

export async function reviewAvailability(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()

  const id = str(fd, 'id')
  const status = str(fd, 'status')

  if (!id) return { error: 'Missing availability request.' }
  if (status !== 'approved' && status !== 'rejected') {
    return { error: 'Invalid review status.' }
  }

  const { error } = await supabase.rpc('set_availability_status', {
    request_id: id,
    requested_status: status,
  })

  if (error) return { error: friendly(error.message) }

  return done(status === 'approved' ? 'Availability approved.' : 'Availability rejected.')
}

// ---------- model answers an offered day ----------
export async function respondToShootDay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const accept = str(fd, 'accept') === 'yes'
  const { error } = await supabase.rpc('respond_to_shoot_day', { day_id: str(fd, 'id'), accept })
  if (error) return { error: friendly(error.message) }
  return done(accept ? 'Confirmed. See you there.' : 'Declined.')
}

// ---------- shoot days (manager / edit members) ----------
function shootDayFields(fd: FormData) {
  return {
    date: str(fd, 'date'),
    start_time: str(fd, 'start_time') || null,
    hours: num(fd, 'hours') || 4,
    person_id: str(fd, 'person_id') || null,
    videos_planned: Math.max(0, Math.floor(num(fd, 'videos_planned') || 0)),
    status: str(fd, 'status') || 'free',
    notes: str(fd, 'notes') || null,
  }
}

export async function createShootDay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const fields = shootDayFields(fd)
  if (!fields.date) return { error: 'Pick a date.' }
  const { error } = await supabase.from('shoot_days').insert(fields)
  if (error) return { error: friendly(error.message) }
  return done('Shoot day added.')
}

export async function updateShootDay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('shoot_days').update(shootDayFields(fd)).eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
  return done('Saved.')
}

export async function deleteShootDay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('shoot_days').delete().eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
  return done('Shoot day deleted.')
}

// ---------- targets & pay (manager) ----------
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
  if (error) return { error: /target_days_max/.test(error.message) ? 'Max days must be at least min days.' : friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
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
  if (!data?.length) return { error: "You don't have permission to do that." }
  if (fd.get('apply_unpaid')) {
    const { error: e2 } = await supabase.from('pay').update({ amount: day_rate }).eq('status', 'not_paid')
    if (e2) return { error: friendly(e2.message) }
    return done('Day rate saved and applied to all unpaid days.')
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
  if (!data?.length) return { error: "You don't have permission to do that." }
  return done(patch.status === 'paid' ? 'Marked paid.' : patch.status === 'not_paid' ? 'Marked not paid.' : 'Saved.')
}

// ---------- people (manager) ----------

async function sendInvite(email: string): Promise<string> {
  const admin = createAdminClient()

  if (!admin) {
    return ' (No secret key set, so no invitation email was sent.)'
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://www.arabiannights.space/auth/confirm',
  })

  if (error) {
    return ` Invitation failed: ${error.message}`
  }

  return ' Invitation email sent.'
}


export async function invitePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can invite people.' }
  const email = str(fd, 'email').toLowerCase()
  const name = str(fd, 'name')
  const role = str(fd, 'role')
  if (!name || !email.includes('@')) return { error: 'Enter a name and a valid email.' }
  const { error } = await supabase.from('people').insert({ name, email, role, access: str(fd, 'access') || 'view' })
  if (error) return { error: friendly(error.message) }
  const note = await sendInvite(email)
  return done(`${name} added.${note}`)
}

export async function resendInvite(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { me } = await session()
  if (me.role !== 'manager') return { error: 'Only the manager can invite people.' }
  return { ok: (await sendInvite(str(fd, 'email'))).trim() }
}

export async function updatePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const id = str(fd, 'id')
  const role = str(fd, 'role')
  if (id === me.id && role !== 'manager') return { error: "You can't remove your own manager role." }
  const { data, error } = await supabase
    .from('people')
    .update({ name: str(fd, 'name'), role, access: str(fd, 'access') || 'view' })
    .eq('id', id)
    .select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
  return done('Saved.')
}

export async function removePerson(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await session()
  const id = str(fd, 'id')
  if (id === me.id) return { error: "You can't remove yourself." }
  const { data, error } = await supabase.from('people').delete().eq('id', id).select('user_id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
  // also delete their login so they can't sign in again
  const userId = data[0].user_id as string | null
  const admin = createAdminClient()
  if (userId && admin) await admin.auth.admin.deleteUser(userId)
  return done('Removed from the team.')
}
export async function markNotificationRead(id: string) {
  const { supabase } = await session()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

// ---------- announcements (manager / edit members) ----------
export async function createAnnouncement(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase, me } = await session()

  const canManage =
    me.role === 'manager' || (me.role === 'member' && me.access === 'edit')

  if (!canManage) return { error: "You don't have permission to publish announcements." }

  const title = str(fd, 'title')
  const body = str(fd, 'body')
  const allModels = str(fd, 'all_models') === 'yes'
  const selectedIds = [...new Set(fd.getAll('person_ids').map(String).filter(Boolean))]

  if (!title || !body) return { error: 'Enter an announcement title and message.' }

  let recipientIds = selectedIds

  if (allModels) {
    const { data, error } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'model')

    if (error) return { error: friendly(error.message) }
    recipientIds = (data ?? []).map((person) => person.id)
  } else if (recipientIds.length) {
    const { data, error } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'model')
      .in('id', recipientIds)

    if (error) return { error: friendly(error.message) }

    if ((data ?? []).length !== recipientIds.length) {
      return { error: 'One or more selected recipients are invalid.' }
    }
  }

  if (!recipientIds.length) {
    return { error: 'Select at least one model or choose all models.' }
  }

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({ title, body, created_by: me.id })
    .select('id')
    .single()

  if (error) return { error: friendly(error.message) }

  const { error: recipientError } = await supabase
    .from('announcement_recipients')
    .insert(recipientIds.map((person_id) => ({
      announcement_id: announcement.id,
      person_id,
    })))

  if (recipientError) {
    await supabase.from('announcements').delete().eq('id', announcement.id)
    return { error: friendly(recipientError.message) }
  }

  revalidatePath('/', 'layout')
  return { ok: `Announcement published to ${recipientIds.length} model${recipientIds.length === 1 ? '' : 's'}.` }
}

export async function deleteAnnouncement(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase, me } = await session()

  const canManage =
    me.role === 'manager' || (me.role === 'member' && me.access === 'edit')

  if (!canManage) return { error: "You don't have permission to delete announcements." }

  const id = str(fd, 'id')
  if (!id) return { error: 'Missing announcement.' }

  const { data, error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: 'Announcement not found or permission denied.' }

  return done('Announcement deleted.')
}

// ---------- shared files (manager / edit members) ----------

export async function uploadSharedFile(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase, me } = await session()

  if (!canEditAll(me)) {
    return { error: "You don't have permission to upload files." }
  }

  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload.' }
  }

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]

  if (!allowedTypes.includes(file.type)) {
    return { error: 'Only PDF, Word, Excel, and PowerPoint documents are allowed.' }
  }

  if (file.size > 15 * 1024 * 1024) {
    return { error: 'The maximum file size is 15 MB.' }
  }

  const allModels = str(fd, 'all_models') === 'yes'
  const selectedIds = [...new Set(fd.getAll('person_ids').map(String).filter(Boolean))]

  let recipientIds = selectedIds

  if (allModels) {
    const { data, error } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'model')

    if (error) return { error: friendly(error.message) }
    recipientIds = (data ?? []).map((person) => person.id)
  } else if (recipientIds.length) {
    const { data, error } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'model')
      .in('id', recipientIds)

    if (error) return { error: friendly(error.message) }

    if ((data ?? []).length !== recipientIds.length) {
      return { error: 'One or more selected recipients are invalid.' }
    }
  }

  if (!recipientIds.length) {
    return { error: 'Select at least one model or choose all models.' }
  }

  const safeName = file.name
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120) || 'document'

  const { data: record, error: recordError } = await supabase
    .from('shared_files')
    .insert({
      name: file.name,
      description: str(fd, 'description') || null,
      storage_path: '',
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: me.id,
    })
    .select('id')
    .single()

  if (recordError) return { error: friendly(recordError.message) }

  const storagePath = `${record.id}/${safeName}`

  const { error: updateError } = await supabase
    .from('shared_files')
    .update({ storage_path: storagePath })
    .eq('id', record.id)

  if (updateError) {
    await supabase.from('shared_files').delete().eq('id', record.id)
    return { error: friendly(updateError.message) }
  }

  const { error: uploadError } = await supabase.storage
    .from('shared-files')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    await supabase.from('shared_files').delete().eq('id', record.id)
    return { error: friendly(uploadError.message) }
  }

  const { error: recipientError } = await supabase
    .from('shared_file_recipients')
    .insert(
      recipientIds.map((person_id) => ({
        file_id: record.id,
        person_id,
      })),
    )

  if (recipientError) {
    await supabase.storage.from('shared-files').remove([storagePath])
    await supabase.from('shared_files').delete().eq('id', record.id)
    return { error: friendly(recipientError.message) }
  }

  revalidatePath('/', 'layout')
  return {
    ok: `File shared with ${recipientIds.length} model${recipientIds.length === 1 ? '' : 's'}.`,
  }
}

export async function deleteSharedFile(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { supabase, me } = await session()

  if (!canEditAll(me)) {
    return { error: "You don't have permission to delete files." }
  }

  const id = str(fd, 'id')
  if (!id) return { error: 'Missing file.' }

  const { data: file, error: findError } = await supabase
    .from('shared_files')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (findError) return { error: friendly(findError.message) }
  if (!file) return { error: 'File not found or permission denied.' }

  const { error: storageError } = await supabase.storage
    .from('shared-files')
    .remove([file.storage_path])

  if (storageError) return { error: friendly(storageError.message) }

  const { data, error } = await supabase
    .from('shared_files')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: 'Could not delete the file record.' }

  return done('File deleted.')
}
