'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getMe } from '@/lib/session'
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
  if (/hours_check/.test(message)) return 'Shoot day hours must be more than 0 and at most 6.'
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
  const start_time = str(fd, 'start_time')
  const end_time = str(fd, 'end_time')
  const dates = fd.getAll('dates').map(String).filter(Boolean)
  if (!dates.length) return { error: 'Pick at least one date.' }
  if (!start_time || !end_time) return { error: 'Enter a start and end time.' }
  if (end_time <= start_time) return { error: 'End time must be after start time.' }

  const failed: string[] = []
  for (const date of dates) {
    const { error } = await supabase.from('availability').insert({ person_id, date, start_time, end_time })
    if (error) failed.push(`${date}: ${friendly(error.message)}`)
  }
  revalidatePath('/', 'layout')
  const added = dates.length - failed.length
  if (failed.length) return { error: `Added ${added} of ${dates.length}. ${failed.join(' · ')}` }
  return { ok: `Added ${start_time}–${end_time} on ${added} date${added === 1 ? '' : 's'}.` }
}

export async function deleteAvailability(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await session()
  const { data, error } = await supabase.from('availability').delete().eq('id', str(fd, 'id')).select('id')
  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: "You don't have permission to do that." }
  return done('Removed.')
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
    hours: num(fd, 'hours') || 6,
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
  if (!admin) return ' (No secret key set, so no email was sent. They can log in with their email at /login.)'

  // 1. Create their login, already confirmed (the manager typed this address).
  const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    return ` But creating their login failed: ${createErr.message}`
  }

  // 2. Email them a login code + link. A separate, cookie-less client is used so
  //    the manager's own session is not touched.
  const h = await headers()
  const origin = h.get('origin') || `https://${h.get('host')}`
  const mailer = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
  })
  const { error } = await mailer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  })
  if (error) return ` Their login is ready, but the email failed (${error.message}). They can log in at /login.`
  return ' Invite email sent.'
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
