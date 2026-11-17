import { redirect } from 'next/navigation'

// Availability is no longer used. Old links and notifications land on the shoot calendar.
export default async function Legacy({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  redirect(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `/shoots?date=${date}` : '/shoots')
}
