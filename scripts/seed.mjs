// Sample team + shoot days for LOCAL testing: 1 manager, 3 models,
// 1 photographer, 1 organizer, with crew lists, details and a script.
// Safe to run more than once.
//
//   node --env-file=.env.local scripts/seed.mjs        (local)
//   node --env-file=.env.local scripts/seed.mjs --yes  (live project: test data only!)
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}
const isLocal = /127\.0\.0\.1|localhost/.test(url)
if (!isLocal && !process.argv.includes('--yes')) {
  console.error('This RESETS all shoot days, announcements and files.')
  console.error('It looks like a live project. Re-run with --yes if you really mean it.')
  process.exit(1)
}
const db = createClient(url, secret, { auth: { persistSession: false } })

const team = [
  { name: 'Manager', email: 'manager@example.com', role: 'manager' },
  { name: 'Sara', email: 'sara@example.com', role: 'model' },
  { name: 'Hala', email: 'hala@example.com', role: 'model' },
  { name: 'Zaid', email: 'zaid@example.com', role: 'model' },
  { name: 'Karim Photo', email: 'photo@example.com', role: 'photographer' },
  { name: 'Omar Organizer', email: 'omar@example.com', role: 'organizer' },
]

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

for (const p of team) must(await db.from('people').upsert(p, { onConflict: 'email' }), `person ${p.email}`)
const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
for (const p of team) {
  if (list.users.some((u) => u.email?.toLowerCase() === p.email)) continue
  must(await db.auth.admin.createUser({ email: p.email, email_confirm: true }), `login ${p.email}`)
}
const people = Object.fromEntries(must(await db.from('people').select('id,name'), 'read people').map((p) => [p.name, p.id]))

must(await db.from('targets').update({ day_rate: 500, target_hours: 40, target_videos: 40, target_days_min: 8, target_days_max: 10 }).eq('id', 1), 'targets')

// reset everything the screens show
for (const t of ['comments', 'reviews', 'shoot_assets']) must(await db.from(t).delete().not('created_at', 'is', null), `clear ${t}`)
must(await db.from('shoot_days').update({ status: 'planned' }).eq('status', 'completed'), 'unlock days')
must(await db.from('pay').delete().not('id', 'is', null), 'clear pay')
must(await db.from('shoot_days').delete().not('id', 'is', null), 'clear shoot days')
must(await db.from('announcements').delete().not('id', 'is', null), 'clear announcements')
must(await db.from('shared_files').delete().not('id', 'is', null), 'clear files')
must(await db.from('notifications').delete().not('id', 'is', null), 'clear notifications')

const days = [
  { date: '2026-11-14', title: 'Camp intro scenes', start_time: '11:00', hours: 4, videos_planned: 4, status: 'completed',
    meeting_time: '10:15', meeting_point: 'Gate 2', location_name: 'Arabian Night camp', crew: ['Sara', 'Hala', 'Karim Photo'] },
  { date: '2026-11-20', title: 'Sunset desert shoot', start_time: '16:00', hours: 4, videos_planned: 5, status: 'planned',
    meeting_time: '15:00', meeting_point: 'Parking, next to the main gate',
    location_name: 'Arabian Night camp', location_address: 'Desert road, 6th of October', location_url: 'https://maps.app.goo.gl/example',
    notes: 'Bring two outfits. Photographer: golden hour from 17:30.',
    crew: ['Sara', 'Hala', 'Zaid', 'Karim Photo', 'Omar Organizer'] },
  { date: '2026-11-24', title: 'Majlis interior', start_time: '12:00', hours: 4, videos_planned: 3, status: 'planned', crew: ['Hala', 'Zaid'] },
  { date: '2026-12-01', title: 'Night market', start_time: '19:00', hours: 4, videos_planned: 4, status: 'planned', crew: [] },
]
for (const { crew, ...d } of days) {
  const { status, ...rest } = d
  const day = must(await db.from('shoot_days').insert({ ...rest, status: 'planned' }).select('id').single(), `day ${d.date}`)
  for (const n of crew) {
    const done = status === 'completed'
    must(await db.from('shoot_attendees').insert({ shoot_day_id: day.id, person_id: people[n], response: done ? 'accepted' : 'pending' }), `crew ${n}`)
  }
  if (status === 'completed') {
    must(await db.from('shoot_fees').insert({ shoot_day_id: day.id, person_id: people['Karim Photo'], amount: 800 }), 'fee')
    must(await db.from('shoot_days').update({ status: 'completed' }).eq('id', day.id), 'complete')
  }
  if (d.date === '2026-11-20') {
    must(await db.from('shoot_assets').insert({
      shoot_day_id: day.id, kind: 'script', title: 'Video 1 – Sara', uploaded_by: people['Manager'],
      body: 'المشهد الأول: سارة تدخل الخيمة وتبتسم للكاميرا.\nScene 1: Sara walks into the tent and smiles to camera.',
    }), 'script')
  }
}
const paid = must(await db.from('pay').select('id').eq('person_id', people['Sara']), 'pay')
if (paid[0]) must(await db.from('pay').update({ status: 'paid' }).eq('id', paid[0].id), 'mark paid')

const ann = must(await db.from('announcements').insert({ title: 'Call time for Friday', body: 'Please arrive 15 minutes early.\nلو سمحتم الحضور قبل الموعد بربع ساعة.', created_by: people['Manager'] }).select('id').single(), 'announcement')
must(await db.from('announcement_recipients').insert(['Sara', 'Hala', 'Zaid', 'Karim Photo', 'Omar Organizer'].map((n) => ({ announcement_id: ann.id, person_id: people[n] }))), 'recipients')

console.log('Seeded: manager, 3 models, 1 photographer, 1 organizer, 4 shoot days')
