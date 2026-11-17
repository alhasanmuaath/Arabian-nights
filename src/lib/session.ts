import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { Person, Role, Targets } from './types'

/** The logged-in user and their people row (null if not invited). */
export const getMe = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, me: null }
  const { data: me } = await supabase.from('people').select('*').eq('user_id', user.id).maybeSingle<Person>()
  return { supabase, user, me }
})

/** Use at the top of a page. With roles: redirects unless the user has one of them. */
export async function requireRole(...roles: Role[]) {
  const { supabase, user, me } = await getMe()
  if (!user) redirect('/login')
  if (!me) redirect('/no-access')
  if (roles.length && !roles.includes(me.role)) redirect('/')
  return { supabase, me }
}

export const getTargets = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.from('targets').select('*').eq('id', 1).single<Targets>()
  return data!
})

// ---- what each role may do (the database enforces the same rules) ----

/** Full control: shoot days, crew, scripts, announcements, files. */
export function canEditAll(me: Person) {
  return me.role === 'manager' || (me.role === 'member' && me.access === 'edit')
}

/** May set a shoot day's location and add place photos. */
export function canEditLocation(me: Person) {
  return canEditAll(me) || me.role === 'organizer'
}

/** Reads every announcement and file. Models read what is assigned to them. */
export function seesEverything(me: Person) {
  return me.role !== 'model'
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  model: 'Model',
  photographer: 'Photographer',
  organizer: 'Organizer',
  member: 'Member',
}

export function homeFor(me: Person) {
  return me.id ? '/dashboard' : '/login'
}
