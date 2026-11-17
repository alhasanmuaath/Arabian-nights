import { addComment, deleteComment, toggleReview } from '@/app/(app)/actions'
import { fmtStamp } from '@/lib/dates'
import type { Comment, Review, TargetType, TeamMember } from '@/lib/types'
import { ActionForm, SubmitButton } from './ActionForm'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { SmallAction } from './SmallAction'

/**
 * "Reviewed" tick + comment thread for an announcement, a shared file,
 * a script or a place photo. Anyone who can see the item can use both.
 */
export function Feedback({
  type,
  id,
  comments,
  reviews,
  team,
  meId,
  isManager,
}: {
  type: TargetType
  id: string
  comments: Comment[]
  reviews: Review[]
  team: Map<string, TeamMember>
  meId: string
  isManager: boolean
}) {
  const reviewedByMe = reviews.some((r) => r.person_id === meId)
  const names = reviews.map((r) => team.get(r.person_id)?.name ?? 'Someone')

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="faint min-w-0">
          {names.length ? (
            <>
              <Icon name="check" size={14} className="mr-1 inline text-ok" />
              Reviewed by {names.join(', ')}
            </>
          ) : (
            'Nobody has marked this reviewed yet'
          )}
        </p>
        <SmallAction
          action={toggleReview}
          fields={{ type, id }}
          variant={reviewedByMe ? 'secondary' : 'primary'}
          label={
            reviewedByMe ? (
              <>
                <Icon name="check" size={14} /> Reviewed
              </>
            ) : (
              'Mark reviewed'
            )
          }
        />
      </div>

      <details className="disclosure" open={comments.length > 0 && comments.length <= 3}>
        <summary className="link flex items-center gap-1.5 text-sm">
          <Icon name="message" size={15} />
          {comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Add a comment'}
        </summary>

        <ul className="space-y-2.5">
          {comments.map((c) => {
            const who = team.get(c.person_id)?.name ?? 'Someone'
            return (
              <li key={c.id} className="flex gap-2.5">
                <Avatar name={who} size={30} />
                <div className="row min-w-0 flex-1 py-2">
                  <p className="faint">
                    <span className="font-semibold text-ink">{who}</span> · {fmtStamp(c.created_at)}
                  </p>
                  <p className="prose-plain mt-0.5 text-ink">{c.body}</p>
                  {(c.person_id === meId || isManager) && (
                    <div className="mt-1.5">
                      <SmallAction action={deleteComment} fields={{ id: c.id }} label="Delete" variant="danger" />
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <ActionForm action={addComment} className="mt-3 space-y-2" resetOnSuccess>
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          <label htmlFor={`c-${id}`} className="sr-only">
            Your comment
          </label>
          <textarea id={`c-${id}`} name="body" rows={2} maxLength={2000} required placeholder="Write a comment…" />
          <SubmitButton variant="secondary" small>
            Post comment
          </SubmitButton>
        </ActionForm>
      </details>
    </div>
  )
}
