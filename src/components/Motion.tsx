'use client'

import { useEffect } from 'react'

/**
 * Pointer-driven depth, for the whole app, from one listener:
 *  - the sky layers shift a little with the mouse (parallax)
 *  - any element marked `data-tilt` leans toward the mouse, or toward a
 *    finger while it is pressed

 */
export function Motion() {
  useEffect(() => {
    const root = document.documentElement
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    let frame = 0
    let x = 0
    let y = 0
    let target: EventTarget | null = null
    let tilted: HTMLElement | null = null

    const release = () => {
      if (!tilted) return
      tilted.style.setProperty('--tx', '0')
      tilted.style.setProperty('--ty', '0')
      tilted.style.setProperty('--tilt-on', '0')
      tilted = null
    }

    const apply = () => {
      frame = 0
      if (canHover) {
        root.style.setProperty('--px', (x / window.innerWidth - 0.5).toFixed(3))
        root.style.setProperty('--py', (y / window.innerHeight - 0.5).toFixed(3))
      }
      const el = target instanceof Element ? target.closest<HTMLElement>('[data-tilt]') : null
      if (el !== tilted) release()
      if (!el) return
      const box = el.getBoundingClientRect()
      const tx = Math.max(-1, Math.min(1, ((x - box.left) / box.width - 0.5) * 2))
      const ty = Math.max(-1, Math.min(1, ((y - box.top) / box.height - 0.5) * 2))
      el.style.setProperty('--tx', tx.toFixed(3))
      el.style.setProperty('--ty', ty.toFixed(3))
      el.style.setProperty('--tilt-on', '1')
      tilted = el
    }

    const track = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && e.type === 'pointermove') return // a moving finger is a scroll
      x = e.clientX
      y = e.clientY
      target = e.target
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const end = () => {
      target = null
      if (!frame) frame = requestAnimationFrame(apply)
    }

    document.addEventListener('pointermove', track, { passive: true })
    document.addEventListener('pointerdown', track, { passive: true })
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') end()
    }
    document.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('pointercancel', end, { passive: true })
    document.addEventListener('pointerleave', end, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', track)
      document.removeEventListener('pointerdown', track)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', end)
      document.removeEventListener('pointerleave', end)
    }
  }, [])
  return null
}
