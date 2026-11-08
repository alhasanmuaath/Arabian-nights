import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { SmallAction } from '@/components/SmallAction'
import { requireRole } from '@/lib/session'
import type { Person } from '@/lib/types'
import { invitePerson, removePerson, resendInvite, updatePerson } from '../actions'

function RoleFields({ prefix, person }: { prefix: string; person?: Person }) {
  return (
    <>
      <div>
        <label htmlFor={`${prefix}role`}>Role</label>
        <select id={`${prefix}role`} name="role" defaultValue={person?.role ?? 'model'}>
          <option value="model">Model: sees only her own data</option>
          <option value="photographer">Photographer: sees assigned shoots and own data</option>
          <option value="member">Member: sees all schedules</option>
          <option value="manager">Manager: full control</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${prefix}access`}>Member access</label>
        <select id={`${prefix}access`} name="access" defaultValue={person?.access ?? 'view'}>
          <option value="view">View only</option>
          <option value="edit">Can edit schedules</option>
        </select>
        <p className="mt-1 text-xs text-gray-600">Only used for members.</p>
      </div>
    </>
  )
}

export default async function People() {
  const { supabase, me } = await requireRole('manager')
  const { data } = await supabase.from('people').select('*').order('role').order('name')
  const people = (data ?? []) as Person[]

  return (
    <>
      <h1>People</h1>

      <section className="card">
        <h2 className="mb-2">Invite someone</h2>
        <ActionForm action={invitePerson} className="space-y-3" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-name">Name</label>
              <input id="new-name" name="name" required />
            </div>
            <div>
              <label htmlFor="new-email">Email (personal email is fine)</label>
              <input id="new-email" name="email" type="email" required />
            </div>
            <RoleFields prefix="new-" />
          </div>
          <SubmitButton>Invite</SubmitButton>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-2">Team ({people.length})</h2>
        <ul className="divide-y divide-gray-100">
          {people.map((p) => (
            <li key={p.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.name} {p.id === me.id && <span className="text-xs text-gray-600">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-gray-700">{p.email}</p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    {p.role}
                    {p.role === 'member' && ` · ${p.access === 'edit' ? 'can edit' : 'view only'}`}
                  </p>
                  <p className="text-xs text-gray-600">{p.user_id ? 'Has logged in / has a login' : 'Invite pending'}</p>
                </div>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-gray-700 underline">Edit</summary>
                <div className="mt-2 space-y-3 rounded border border-gray-200 p-3">
                  <ActionForm action={updatePerson} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <div className="sm:col-span-2">
                      <label htmlFor={`n-${p.id}`}>Name</label>
                      <input id={`n-${p.id}`} name="name" defaultValue={p.name} required />
                    </div>
                    <RoleFields prefix={`p-${p.id}-`} person={p} />
                    <div className="sm:col-span-2">
                      <SubmitButton>Save</SubmitButton>
                    </div>
                  </ActionForm>
                  <div className="flex flex-wrap gap-2">
                    <SmallAction action={resendInvite} fields={{ email: p.email }} label="Resend invite" />
                    {p.id !== me.id && (
                      <SmallAction action={removePerson} fields={{ id: p.id }} label="Remove from team" variant="danger" />
                    )}
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
