import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { SmallAction } from '@/components/SmallAction'
import { ROLE_LABEL, requireRole } from '@/lib/session'
import type { Person } from '@/lib/types'
import { invitePerson, removePerson, resendInvite, sendTestEmail, updatePerson } from '../actions'

// Sending an email can take a few seconds; allow for a slow mail server.
export const maxDuration = 30

const ROLE_HELP: Record<string, string> = {
  model: 'Sees every shoot day and who is on it. Gets announcements and files assigned to her. Sees only her own pay.',
  photographer: 'Sees every shoot day, announcement and file. Can comment and mark reviewed. Sees only own pay.',
  organizer: 'Same as photographer, and can set the location and add photos of the place.',
  manager: 'Full control: shoot days, crew, scripts, announcements, files, pay, people.',
}

function RoleSelect({ id, value }: { id: string; value: string }) {
  return (
    <div>
      <label htmlFor={id}>Role</label>
      <select id={id} name="role" defaultValue={value}>
        <option value="model">Model</option>
        <option value="photographer">Photographer</option>
        <option value="organizer">Organizer</option>
        <option value="manager">Manager</option>
        {value === 'member' && <option value="member">Member (old role)</option>}
      </select>
    </div>
  )
}

export default async function People() {
  const { supabase, me } = await requireRole('manager')
  const { data } = await supabase.from('people').select('*').order('role').order('name')
  const people = (data ?? []) as Person[]

  return (
    <>
      <header>
        <p className="eyebrow">{people.length} on the team</p>
        <h1 className="mt-1">People</h1>
      </header>

      <section className="glass glass-pad space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="bell" className="text-gold-300" />
          <h2>Email check</h2>
        </div>
        <p className="muted">
          Invitations and password reset codes are sent from your mailbox. Press the button to send a test email to your own address and see
          exactly what the mail server says.
        </p>
        <ActionForm action={sendTestEmail}>
          <SubmitButton small>Send me a test email</SubmitButton>
        </ActionForm>
      </section>

      <section className="glass glass-pad">
        <details className="disclosure">
          <summary className="btn btn-primary">
            <Icon name="plus" size={16} /> Invite someone
          </summary>
          <ActionForm action={invitePerson} className="space-y-4" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-name">Name</label>
                <input id="new-name" name="name" required />
              </div>
              <div>
                <label htmlFor="new-email">Email (a personal email is fine)</label>
                <input id="new-email" name="email" type="email" inputMode="email" autoComplete="off" required />
              </div>
              <RoleSelect id="new-role" value="model" />
            </div>
            <SubmitButton>Send invitation</SubmitButton>
          </ActionForm>
        </details>
        <dl className="faint mt-4 space-y-1.5">
          {Object.entries(ROLE_HELP).map(([role, text]) => (
            <div key={role}>
              <dt className="inline font-semibold text-ink-2">{ROLE_LABEL[role as keyof typeof ROLE_LABEL]}: </dt>
              <dd className="inline">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="glass glass-pad">
        <ul className="divide">
          {people.map((p) => (
            <li key={p.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.name} {p.id === me.id && <span className="faint">(you)</span>}
                  </p>
                  <p className="faint truncate">{p.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="chip chip-role">{ROLE_LABEL[p.role]}</span>
                  {!p.user_id && <span className="chip chip-wait">Not logged in yet</span>}
                </div>
              </div>
              <details className="disclosure mt-2">
                <summary className="link text-sm">Edit</summary>
                <div className="space-y-3">
                  <ActionForm action={updatePerson} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <label htmlFor={`n-${p.id}`}>Name</label>
                      <input id={`n-${p.id}`} name="name" defaultValue={p.name} required />
                    </div>
                    <RoleSelect id={`r-${p.id}`} value={p.role} />
                    <div className="sm:col-span-2">
                      <SubmitButton small>Save</SubmitButton>
                    </div>
                  </ActionForm>
                  <div className="flex flex-wrap gap-2">
                    <SmallAction action={resendInvite} fields={{ email: p.email }} label="Resend invitation" />
                    {p.id !== me.id && <SmallAction action={removePerson} fields={{ id: p.id }} label="Remove from team" variant="danger" />}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
