// Creates one manager and two sample models, with logins, availability and
// shoot days. Safe to run more than once.
//
//   node --env-file=.env.local scripts/seed.mjs        (local)
//   node --env-file=.env.local scripts/seed.mjs --yes  (live project: test data only!)
//
// Override the emails with SEED_MANAGER_EMAIL / SEED_MODEL1_EMAIL / SEED_MODEL2_EMAIL.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}
const isLocal = /127\.0\.0\.1|localhost/.test(url)
if (!isLocal && !process.argv.includes('--yes')) {
  console.error('This RESETS all shoot days and the sample models\' availability.')
  console.error('It looks like a live project. Re-run with --yes if you really mean it.')
  process.exit(1)
}
const db = createClient(url, secret, { auth: { persistSession: false } })

const team = [
  { name: 'Manager', email: process.env.SEED_MANAGER_EMAIL || 'manager@example.com', role: 'manager' },
  { name: 'Sara (sample model)', email: process.env.SEED_MODEL1_EMAIL || 'sara@example.com', role: 'model' },
  { name: 'Mona (sample model)', email: process.env.SEED_MODEL2_EMAIL || 'mona@example.com', role: 'model' },
]

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

// 1. people rows
for (const p of team) {
  must(await db.from('people').upsert({ ...p, email: p.email.toLowerCase() }, { onConflict: 'email' }), `person ${p.email}`)
}

// 2. login accounts (the database links them to people rows by email)
const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
for (const p of team) {
  if (list.users.some((u) => u.email?.toLowerCase() === p.email.toLowerCase())) continue
  must(await db.auth.admin.createUser({ email: p.email, email_confirm: true }), `login ${p.email}`)
}

const people = must(await db.from('people').select('id,email,role,user_id'), 'read people')
const byEmail = Object.fromEntries(people.map((p) => [p.email, p]))
const sara = byEmail[team[1].email.toLowerCase()]
const mona = byEmail[team[2].email.toLowerCase()]

// 3. targets
must(
  await db.from('targets').update({ target_hours: 54, target_videos: 40, target_days_min: 8, target_days_max: 10, day_rate: 3000, currency: 'EGP' }).eq('id', 1),
  'targets',
)

// 4. sample availability (reset for the two sample models)
must(await db.from('availability').delete().in('person_id', [sara.id, mona.id]), 'clear availability')
const windows = [
  [sara, '2026-11-10', '10:00', '16:00'],
  [sara, '2026-11-12', '09:00', '12:00'],
  [sara, '2026-11-12', '15:00', '18:00'], // split day: 3 h + 3 h
  [sara, '2026-11-15', '12:00', '18:00'],
  [sara, '2026-11-20', '10:00', '14:00'],
  [mona, '2026-11-11', '11:00', '17:00'],
  [mona, '2026-11-12', '10:00', '16:00'],
  [mona, '2026-11-18', '13:00', '19:00'],
  [mona, '2026-11-25', '09:00', '13:00'],
]
for (const [p, date, start_time, end_time] of windows) {
  must(await db.from('availability').insert({ person_id: p.id, date, start_time, end_time }), `availability ${date}`)
}

// 5. sample shoot days (reset)
must(await db.from('shoot_days').delete().not('id', 'is', null), 'clear shoot days')
const days = [
  { date: '2026-11-10', start_time: '10:00', person_id: sara.id, videos_planned: 5, status: 'completed' },
  { date: '2026-11-11', start_time: '11:00', person_id: mona.id, videos_planned: 5, status: 'completed' },
  { date: '2026-11-15', start_time: '12:00', person_id: sara.id, videos_planned: 4, status: 'confirmed' },
  { date: '2026-11-18', start_time: '13:00', person_id: mona.id, videos_planned: 4, status: 'offered' },
  { date: '2026-11-22', videos_planned: 4, status: 'free' },
]
for (const d of days) must(await db.from('shoot_days').insert({ hours: 6, ...d }), `shoot day ${d.date}`)

// mark Sara's completed day as paid
const saraPay = must(await db.from('pay').select('id').eq('person_id', sara.id), 'read pay')
if (saraPay[0]) must(await db.from('pay').update({ status: 'paid' }).eq('id', saraPay[0].id), 'mark paid')

console.log('Seeded:')
for (const p of team) console.log(`  ${p.role.padEnd(8)} ${p.email}`)
