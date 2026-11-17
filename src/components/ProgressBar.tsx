/** Horizontal progress with the numbers written out. */
export function ProgressBar({
  label,
  value,
  target,
  unit = '',
  note,
}: {
  label: string
  value: number
  target: number
  unit?: string
  note?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const v = Math.round(value * 100) / 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="num text-sm text-ink-2">
          <span className="font-semibold text-ink">
            {v}
            {unit}
          </span>{' '}
          / {target}
          {unit}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={label}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={target}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-violet), var(--color-gold-400))' }}
        />
      </div>
      {note && <p className="faint">{note}</p>}
    </div>
  )
}
