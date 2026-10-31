import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { publicOrigin } from '@/lib/origin'
import { createClient } from '@/lib/supabase/server'

// Handles the link in login / invite emails.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const origin = publicOrigin(request)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const supabase = await createClient()

  let ok = false
  if (token_hash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash, type })).error
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  }
  return NextResponse.redirect(ok ? `${origin}/` : `${origin}/login?error=link`)
}
