import { Feedback } from '@/components/Feedback'
import { FileShareForm } from '@/components/FileShareForm'
import { Icon } from '@/components/Icon'
import { Panel } from '@/components/Panel'
import { SmallAction } from '@/components/SmallAction'
import { getFeedback, getTeam } from '@/lib/data'
import { fmtSize, fmtStamp } from '@/lib/dates'
import { canEditAll, getSupabase, requireRole, seesEverything } from '@/lib/session'
import { deleteSharedFile } from '../actions'

type SharedFile = {
  id: string
  name: string
  description: string | null
  size_bytes: number
  uploaded_by: string
  created_at: string
}

export default async function FilesPage() {
  const supabase = await getSupabase()

  const [{ me }, team, listRes] = await Promise.all([
    requireRole(),
    getTeam(supabase),
    supabase
      .from('shared_files')
      .select('id, name, description, size_bytes, uploaded_by, created_at')
      .order('created_at', { ascending: false }),
  ])
  const canManage = canEditAll(me)
  const files = (listRes.data ?? []) as SharedFile[]
  const feedback = await getFeedback(supabase, 'file', files.map((f) => f.id))
  const others = [...team.values()].filter((p) => p.id !== me.id)

  return (
    <>
      <header>
        <p className="eyebrow">{seesEverything(me) ? 'Every shared document' : 'Shared with you'}</p>
        <h1 className="mt-1">Files</h1>
      </header>

      {canManage && (
        <section className="glass glass-pad">
          <Panel
            defaultOpen={files.length === 0}
            summary={
              <>
                <Icon name="upload" size={16} /> Share a file
              </>
            }
          >
            <FileShareForm people={others} />
          </Panel>
        </section>
      )}

      {listRes.error && (
        <p role="alert" className="msg-error">
          Could not load files: {listRes.error.message}
        </p>
      )}

      {files.length === 0 && !listRes.error && (
        <section className="glass glass-pad text-center">
          <Icon name="folder" size={28} className="mx-auto text-ink-3" />
          <p className="mt-2 font-medium">No files yet</p>
          <p className="muted">Documents shared by the manager will show up here.</p>
        </section>
      )}

      {files.map((f) => (
        <article key={f.id} id={`f-${f.id}`} className="glass glass-pad scroll-mt-24">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/8">
                <Icon name="script" className="text-gold-300" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words text-base">{f.name}</h2>
                {f.description && <p className="muted mt-0.5">{f.description}</p>}
                <p className="faint mt-0.5">
                  {team.get(f.uploaded_by)?.name ?? 'Manager'} · {fmtStamp(f.created_at)} · {fmtSize(f.size_bytes)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/files/${f.id}`} className="btn btn-sm">
                <Icon name="download" size={15} /> Open
              </a>
              {canManage && <SmallAction action={deleteSharedFile} fields={{ id: f.id }} label="Delete" variant="danger" />}
            </div>
          </div>
          <Feedback
            type="file"
            id={f.id}
            comments={feedback.comments.get(f.id) ?? []}
            reviews={feedback.reviews.get(f.id) ?? []}
            team={team}
            meId={me.id}
            isManager={me.role === 'manager'}
          />
        </article>
      ))}
    </>
  )
}
