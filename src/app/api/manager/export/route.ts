
import { getMe } from '../../../../lib/session'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

type Row = Record<string, any>

async function fetchAll(supabase: any, table: string): Promise<Row[]> {
  const rows: Row[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(`Could not export ${table}: ${error.message}`)
    }

    const batch = (data ?? []) as Row[]
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

function addSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: Row[],
) {
  const sheet = XLSX.utils.json_to_sheet(rows)

  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    sheet['!cols'] = keys.map((key) => ({
      wch: Math.min(
        Math.max(
          key.length + 2,
          ...rows.map((row) => String(row[key] ?? '').length + 2),
        ),
        40,
      ),
    }))
  }

  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

export async function GET() {
  const { user, me, supabase } = await getMe()

  if (!user || !me) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (me.role !== 'manager') {
    return new Response('Forbidden: managers only', { status: 403 })
  }

  try {
    const [people, availability, shootDays, payments, targets] =
      await Promise.all([
        fetchAll(supabase, 'people'),
        fetchAll(supabase, 'availability'),
        fetchAll(supabase, 'shoot_days'),
        fetchAll(supabase, 'pay'),
        fetchAll(supabase, 'targets'),
      ])

    const personNames = new Map(
      people.map((person) => [person.id, person.name]),
    )

    const peopleRows = people.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      access: person.access,
      user_id: person.user_id,
      created_at: person.created_at,
    }))

    const availabilityRows = availability.map((item) => ({
      id: item.id,
      person: personNames.get(item.person_id) ?? item.person_id,
      person_id: item.person_id,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      hours: item.hours,
      status: item.status ?? 'Not available',
      created_at: item.created_at,
    }))

    const approvedRows = availabilityRows.filter(
      (item) => item.status === 'approved',
    )

    const shootDayRows = shootDays.map((day) => ({
      id: day.id,
      date: day.date,
      person: day.person_id
        ? personNames.get(day.person_id) ?? day.person_id
        : 'Unassigned',
      person_id: day.person_id,
      start_time: day.start_time,
      hours: day.hours,
      videos_planned: day.videos_planned,
      status: day.status,
      notes: day.notes,
      created_at: day.created_at,
      updated_at: day.updated_at,
    }))

    const paymentRows = payments.map((payment) => ({
      id: payment.id,
      person: personNames.get(payment.person_id) ?? payment.person_id,
      person_id: payment.person_id,
      shoot_day_id: payment.shoot_day_id,
      amount: payment.amount,
      status: payment.status,
      paid_at: payment.paid_at,
      updated_at: payment.updated_at,
    }))

    const workbook = XLSX.utils.book_new()

    addSheet(workbook, 'People', peopleRows)
    addSheet(workbook, 'Availability', availabilityRows)
    addSheet(workbook, 'Approved Schedule', approvedRows)
    addSheet(workbook, 'Shoot Days', shootDayRows)
    addSheet(workbook, 'Payments', paymentRows)
    addSheet(workbook, 'Settings', targets)

    const file = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    }) as Buffer

    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="Arabian-Nights-Data.xlsx"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Manager export failed:', error)

    return new Response('Could not generate the export file.', {
      status: 500,
    })
  }
}
