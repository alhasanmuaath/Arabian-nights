import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

/** Admin client (bypasses row-level security). Server-only; used just for invites. */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}
