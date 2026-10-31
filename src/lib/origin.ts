import type { NextRequest } from 'next/server'

/** The address the visitor actually used (works behind proxies like Vercel). */
export function publicOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return host ? `${proto}://${host}` : request.nextUrl.origin
}
