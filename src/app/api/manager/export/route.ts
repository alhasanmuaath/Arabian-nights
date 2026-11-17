
import { getMe } from '../../../../lib/session'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type Row = Record<string, unknown> & { id: string; person_id: string; shoot_day_id: string; date: string; title?: string | null; name?: string }

async function fetchAll(supabase: SupabaseClient, table: string): Promise<Row[]> {
  const rows: Row[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Could not export ${table}`)

    const batch = (data ?? []) as Row[]
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

function createExcel(rows: Row[]): Buffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data')

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
  }) as Buffer
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
    const [people, shootDays, attendees, payments, targets] = await Promise.all([
      fetchAll(supabase, 'people'),
      fetchAll(supabase, 'shoot_days'),
      fetchAll(supabase, 'shoot_attendees'),
      fetchAll(supabase, 'pay'),
      fetchAll(supabase, 'targets'),
    ])

    const personNames = new Map(people.map((person) => [person.id, person.name]))
    const dayLabels = new Map(shootDays.map((day) => [day.id, `${day.date}${day.title ? ' · ' + day.title : ''}`]))

    const shootDayRows = shootDays.map((day) => {
      const rest = { ...day }
      delete (rest as Partial<Row>).person_id // legacy column, replaced by the crew list
      return rest
    })

    const crewRows = attendees.map((a) => ({
      ...a,
      shoot_day: dayLabels.get(a.shoot_day_id) ?? a.shoot_day_id,
      person: personNames.get(a.person_id) ?? a.person_id,
    }))

    const paymentRows = payments.map((payment) => ({
      ...payment,
      shoot_day: dayLabels.get(payment.shoot_day_id) ?? payment.shoot_day_id,
      person: personNames.get(payment.person_id) ?? payment.person_id,
    }))

    const sections = [
      { name: 'People.xlsx', rows: people },
      { name: 'Shoot-Days.xlsx', rows: shootDayRows },
      { name: 'Crew.xlsx', rows: crewRows },
      { name: 'Payments.xlsx', rows: paymentRows },
      { name: 'Settings.xlsx', rows: targets },
    ]

    const zip = new JSZip()

    for (const section of sections) {
      zip.file(section.name, createExcel(section.rows))
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition':
          'attachment; filename="Arabian-Nights-Exports.zip"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Manager export failed:', error)

    return new Response('Could not generate export files.', {
      status: 500,
    })
  }
}
