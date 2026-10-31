// Adds the first manager (you) to a fresh project, with a ready-to-use login.
//
//   node --env-file=.env.local scripts/add-manager.mjs "Your Name" you@gmail.com
//
// Then open the app, enter that email, and type the 6-digit code you receive.
import { createClient } from '@supabase/supabase-js'

const [name, emailArg] = process.argv.slice(2)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!name || !emailArg?.includes('@')) {
  console.error('Usage: node --env-file=.env.local scripts/add-manager.mjs "Your Name" you@gmail.com')
  process.exit(1)
}
if (!url || !secret) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}
const email = emailArg.trim().toLowerCase()
const db = createClient(url, secret, { auth: { persistSession: false } })

const { error: pErr } = await db.from('people').upsert({ name, email, role: 'manager' }, { onConflict: 'email' })
if (pErr) throw new Error(pErr.message)

const { error: uErr } = await db.auth.admin.createUser({ email, email_confirm: true })
if (uErr && !/already|registered|exists/i.test(uErr.message)) throw new Error(uErr.message)

console.log(`${name} <${email}> is now a manager. Log in at your app's /login page.`)
