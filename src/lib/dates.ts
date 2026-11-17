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

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMinutes = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

export type Session = { start: string; end: string; hours: number }

/**
 * The time blocks of a shoot day: one, or two when the day is split
 * (for example 2 h in the morning and 2 h in the evening).
 */
export function sessionsOf(day: {
  start_time: string | null
  hours: number
  second_start_time: string | null
  second_hours: number | null
}): Session[] {
  if (!day.start_time) return []
  const total = Number(day.hours)
  if (day.second_start_time && day.second_hours) {
    const second = Number(day.second_hours)
    const first = total - second
    return [
      { start: fmtTime(day.start_time), end: fromMinutes(toMinutes(day.start_time) + first * 60), hours: first },
      { start: fmtTime(day.second_start_time), end: fromMinutes(toMinutes(day.second_start_time) + second * 60), hours: second },
    ]
  }
  return [{ start: fmtTime(day.start_time), end: fromMinutes(toMinutes(day.start_time) + total * 60), hours: total }]
}

/** "16:00–20:00" or "10:00–12:00 + 18:00–20:00". */
export function sessionsLabel(day: Parameters<typeof sessionsOf>[0]): string {
  return sessionsOf(day)
    .map((s) => `${s.start}–${s.end}`)
    .join(' + ')
}

export { toMinutes }

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
