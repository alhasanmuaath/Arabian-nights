
import { getMe, canEditAll } from '@/lib/session'
import { redirect } from 'next/navigation'
import { SharedFiles } from '@/components/SharedFiles'

export default async function FilesPage() {
  const { supabase, user, me } = await getMe()

  if (!user) redirect('/login')
  if (!me) redirect('/no-access')

  const canManage = canEditAll(me)

  const { data: files, error } = await supabase
    .from('shared_files')
    .select('id, name, description, size_bytes, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return <p className="text-sm text-red-600">Could not load shared files: {error.message}</p>
  }

  let models: { id: string; name: string }[] = []

  if (canManage) {
    const { data } = await supabase
      .from('people')
      .select('id, name')
      .eq('role', 'model')
      .order('name')

    models = data ?? []
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Shared files</h1>
        <p className="mt-1 text-sm text-gray-600">
          Documents shared with you by the team.
        </p>
      </div>

      <SharedFiles
        models={models}
        files={files ?? []}
        canManage={canManage}
      />
    </div>
  )
}
