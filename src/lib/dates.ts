export const TZ = 'Africa/Cairo'

/** Every YYYY-MM-DD date from start to end, inclusive. */
export function seasonDates(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Today's date in Cairo, as YYYY-MM-DD. */
export function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

/** Hour of the day in Cairo (0-23). */
export function cairoHour(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()))
}

const asUTC = (d: string) => new Date(d + 'T00:00:00Z')
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => asUTC(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })

export const fmtDate = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtDateLong = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })
export const fmtDateShort = (d: string) => fmt(d, { day: 'numeric', month: 'short' })
export const monthShort = (d: string) => fmt(d, { month: 'short' })
export const weekdayShort = (d: string) => fmt(d, { weekday: 'short' })
export const weekday = (d: string) => asUTC(d).getUTCDay() // 0 = Sunday
export const dayNum = (d: string) => asUTC(d).getUTCDate()

/** "Today", "Tomorrow", "In 4 days", "3 days ago". */
export function relDay(d: string, today = cairoToday()): string {
  const n = Math.round((asUTC(d).getTime() - asUTC(today).getTime()) / 86400000)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return n > 0 ? `In ${n} days` : `${-n} days ago`
}

export function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : ''
}

/** A timestamp shown in Cairo time, e.g. "16 Nov, 14:05". */
export function fmtStamp(ts: string) {
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtHours(n: number) {
  return `${Math.round(Number(n) * 100) / 100} h`
}

export function money(n: number, currency: string) {
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
}

export function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
