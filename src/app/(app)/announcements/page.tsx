import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { AudiencePicker } from '@/components/AudiencePicker'
import { Feedback } from '@/components/Feedback'
import { Icon } from '@/components/Icon'
import { Panel } from '@/components/Panel'
import { SmallAction } from '@/components/SmallAction'
import { getFeedback, getTeam } from '@/lib/data'
import { fmtStamp } from '@/lib/dates'
import { canEditAll, getSupabase, requireRole, seesEverything } from '@/lib/session'
import { createAnnouncement, deleteAnnouncement } from '../actions'

type Announcement = { id: string; title: string; body: string; created_by: string; created_at: string }

export default async function AnnouncementsPage() {
  const supabase = await getSupabase()

  const [{ me }, team, listRes] = await Promise.all([
    requireRole(),
    getTeam(supabase),
    supabase.from('announcements').select('id, title, body, created_by, created_at').order('created_at', { ascending: false }),
  ])
  const canManage = canEditAll(me)
  const items = (listRes.data ?? []) as Announcement[]
  const feedback = await getFeedback(supabase, 'announcement', items.map((a) => a.id))
  const others = [...team.values()].filter((p) => p.id !== me.id)

  return (
    <>
      <header>
        <p className="eyebrow">{seesEverything(me) ? 'Everything sent to the team' : 'Sent to you'}</p>
        <h1 className="mt-1">News</h1>
      </header>

      {canManage && (
        <section className="glass glass-pad">
          <Panel
            defaultOpen={items.length === 0}
            summary={
              <>
                <Icon name="plus" size={16} /> New announcement
              </>
            }
          >
            <ActionForm action={createAnnouncement} className="space-y-4" resetOnSuccess>
              <div>
                <label htmlFor="announcement-title">Title</label>
                <input id="announcement-title" name="title" maxLength={150} required />
              </div>
              <div>
                <label htmlFor="announcement-body">Message</label>
                <textarea id="announcement-body" name="body" dir="auto" rows={5} maxLength={5000} required />
              </div>
              <AudiencePicker people={others} />
              <SubmitButton>Publish</SubmitButton>
            </ActionForm>
          </Panel>
        </section>
      )}

      {listRes.error && (
        <p role="alert" className="msg-error">
          Could not load announcements: {listRes.error.message}
        </p>
      )}

      {items.length === 0 && !listRes.error && (
        <section className="glass glass-pad text-center">
          <Icon name="megaphone" size={28} className="mx-auto text-ink-3" />
          <p className="mt-2 font-medium">No announcements yet</p>
          <p className="muted">New updates from the manager will show up here.</p>
        </section>
      )}

      {items.map((a) => (
        <article key={a.id} id={`a-${a.id}`} className="glass glass-pad scroll-mt-24">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words">{a.title}</h2>
              <p className="faint">
                {team.get(a.created_by)?.name ?? 'Manager'} · {fmtStamp(a.created_at)}
              </p>
            </div>
            {canManage && <SmallAction action={deleteAnnouncement} fields={{ id: a.id }} label="Delete" variant="danger" />}
          </div>
          <p dir="auto" className="prose-plain mt-3 text-ink">
            {a.body}
          </p>
          <Feedback
            type="announcement"
            id={a.id}
            comments={feedback.comments.get(a.id) ?? []}
            reviews={feedback.reviews.get(a.id) ?? []}
            team={team}
            meId={me.id}
            isManager={me.role === 'manager'}
          />
        </article>
      ))}
    </>
  )
}
