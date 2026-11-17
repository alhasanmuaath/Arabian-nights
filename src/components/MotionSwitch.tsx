'use client'

import { useSyncExternalStore } from 'react'
import { Icon } from './Icon'

type Pref = 'auto' | 'on' | 'off'

const reduces = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Sets what the whole app does right now (the CSS and Motion.tsx read this attribute). */
function apply(pref: Pref) {
  document.documentElement.dataset.motion = pref === 'on' || (pref === 'auto' && !reduces()) ? 'on' : 'off'
}

/**
 * "Motion: Auto / On / Off". Auto follows the device. Many computers and phones
 * have "reduce motion" or "animation effects" switched off, which turns the app's
 * animations off too; On overrides that for this browser.
 */
const listeners = new Set<() => void>()
const subscribePref = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const readPref = (): Pref => {
  try {
    const saved = localStorage.getItem('motion')
    return saved === 'on' || saved === 'off' ? saved : 'auto'
  } catch {
    return 'auto'
  }
}
const subscribeDevice = (cb: () => void) => {
  const q = window.matchMedia('(prefers-reduced-motion: reduce)')
  q.addEventListener('change', cb)
  return () => q.removeEventListener('change', cb)
}

export function MotionSwitch() {
  // Read from the browser without a hydration mismatch: the server renders "auto".
  const pref = useSyncExternalStore(subscribePref, readPref, () => 'auto' as Pref)
  const deviceReduces = useSyncExternalStore(subscribeDevice, reduces, () => false)

  const choose = (next: Pref) => {
    try {
      if (next === 'auto') localStorage.removeItem('motion')
      else localStorage.setItem('motion', next)
    } catch {}
    apply(next)
    listeners.forEach((cb) => cb())
  }

  const options: { value: Pref; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ]

  return (
    <section className="glass glass-pad space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="moon" className="text-gold-300" />
        <h2>Motion</h2>
      </div>
      <p className="muted">Screens turn in 3D, the sky drifts, and cards lean toward you. Auto follows your device.</p>
      <div role="group" aria-label="Motion" className="grid grid-cols-3 gap-1.5 rounded-full border border-white/12 bg-night-950/30 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={pref === o.value}
            onClick={() => choose(o.value)}
            className={`min-h-10 rounded-full text-sm font-semibold ${pref === o.value ? 'bg-white/16 text-ink' : 'text-ink-3'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {deviceReduces && pref === 'auto' && (
        <p role="status" className="msg-error">
          Your device is set to reduce motion, so the animations are off. Choose <strong>On</strong> to see them anyway.
        </p>
      )}
    </section>
  )
}
