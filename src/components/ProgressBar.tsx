/** Plain horizontal progress bar with the numbers written out. */
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
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-gray-700">
          {v}
          {unit} / {target}
          {unit} · {pct}%
        </span>
      </div>
      <div
        className="h-3 w-full rounded-sm bg-gray-200"
        role="progressbar"
        aria-label={label}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={target}
      >
        <div className="h-3 rounded-sm bg-gray-800" style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="text-xs text-gray-600">{note}</p>}
    </div>
  )
}
