import type { CrewResponse } from '@/lib/types'

// A stable soft colour per person, picked from their name.
const HUES = [262, 199, 38, 330, 160, 14, 222, 285]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

const RING: Record<CrewResponse, string> = {
  accepted: 'var(--color-ok)',
  pending: 'var(--color-wait)',
  declined: 'var(--color-no)',
}

export function Avatar({
  name,
  size = 36,
  response,
}: {
  name: string
  size?: number
  response?: CrewResponse
}) {
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  const hue = HUES[sum % HUES.length]
  return (
    <span
      title={response ? `${name} · ${response}` : name}
      className="relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        color: `hsl(${hue} 90% 92%)`,
        background: `linear-gradient(145deg, hsl(${hue} 70% 46% / 0.75), hsl(${hue} 70% 30% / 0.75))`,
        border: '1px solid rgb(255 255 255 / 0.22)',
        opacity: response === 'declined' ? 0.55 : 1,
      }}
    >
      <span aria-hidden="true">{initials(name)}</span>
      {response && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 rounded-full"
          style={{ width: 11, height: 11, background: RING[response], border: '2px solid #1a1a4a' }}
        />
      )}
    </span>
  )
}

/** Overlapping avatars for a crew, with a "+N" when there are many. */
export function AvatarStack({
  people,
  max = 6,
  size = 32,
}: {
  people: { name: string; response?: CrewResponse }[]
  max?: number
  size?: number
}) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={i} className="pop" style={{ marginLeft: i ? -8 : 0, ['--i' as string]: i }}>
          <Avatar name={p.name} size={size} response={p.response} />
        </span>
      ))}
      {extra > 0 && <span className="faint ml-2">+{extra}</span>}
    </span>
  )
}
