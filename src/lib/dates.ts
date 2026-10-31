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

const asUTC = (d: string) => new Date(d + 'T00:00:00Z')

export function fmtDate(d: string) {
  return asUTC(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
export function fmtDateShort(d: string) {
  return asUTC(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
export function weekday(d: string) {
  return asUTC(d).getUTCDay() // 0 = Sunday
}
export function dayNum(d: string) {
  return asUTC(d).getUTCDate()
}
export function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : ''
}
export function fmtHours(n: number) {
  return `${Math.round(Number(n) * 100) / 100} h`
}
export function money(n: number, currency: string) {
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}\u00a0${currency}`
}
