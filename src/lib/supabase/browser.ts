'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './env'

/** Supabase client for the browser (used only for direct file uploads). */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)
}
