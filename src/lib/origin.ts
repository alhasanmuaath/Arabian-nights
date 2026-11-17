import type { NextRequest } from 'next/server'

/** The address the visitor actually used (works behind proxies like Vercel). */
export function publicOrigin(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return host ? `${proto}://${host}` : request.nextUrl.origin
}

/** The address the manager is using, for links inside emails. Can be forced with NEXT_PUBLIC_SITE_URL. */
export function originFromHeaders(h: Headers) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
