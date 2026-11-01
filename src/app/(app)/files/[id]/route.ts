
import { NextResponse } from 'next/server'
import { getMe } from '@/lib/session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, me } = await getMe()

  if (!user || !me) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { id } = await params

  const { data: file, error } = await supabase
    .from('shared_files')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()

  if (error || !file?.storage_path) {
    return new NextResponse('File not found or access denied', {
      status: 404,
    })
  }

  const { data, error: signedError } = await supabase.storage
    .from('shared-files')
    .createSignedUrl(file.storage_path, 60)

  if (signedError || !data?.signedUrl) {
    return new NextResponse('Unable to create download link', {
      status: 403,
    })
  }

  return NextResponse.redirect(data.signedUrl)
}
