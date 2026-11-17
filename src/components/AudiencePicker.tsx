import type { Role, TeamMember } from '@/lib/types'

const GROUPS: { role: Role; label: string }[] = [
  { role: 'model', label: 'Models' },
  { role: 'photographer', label: 'Photographers' },
  { role: 'organizer', label: 'Organizers' },
  { role: 'member', label: 'Members' },
  { role: 'manager', label: 'Managers' },
]

/** Tick boxes for people, grouped by role. Posts `person_ids`. */
export function PeopleChecklist({ people, name = 'person_ids' }: { people: TeamMember[]; name?: string }) {
  if (!people.length) return <p className="faint">No one else is on the team yet.</p>
  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const group = people.filter((p) => p.role === g.role)
        if (!group.length) return null
        return (
          <div key={g.role}>
            <p className="faint mb-1.5">{g.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.map((p) => (
                <label key={p.id} className="cursor-pointer">
                  <input type="checkbox" name={name} value={p.id} className="peer sr-only" />
                  <span className="chip px-3 py-1.5 text-[13px] peer-checked:border-gold-300/70 peer-checked:bg-gold-400/20 peer-checked:text-gold-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold-300">
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** "Everyone" or a hand-picked list. Posts `everyone=yes` and/or `person_ids`. */
export function AudiencePicker({ people }: { people: TeamMember[] }) {
  return (
    <fieldset className="row space-y-3">
      <legend className="sr-only">Who is this for?</legend>
      <p className="text-sm font-medium">Who is this for?</p>
      <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-medium text-ink">
        <input type="checkbox" name="everyone" value="yes" />
        Everyone on the team
      </label>
      <p className="faint">Or pick people. Models only see what is assigned to them.</p>
      <PeopleChecklist people={people} />
    </fieldset>
  )
}
