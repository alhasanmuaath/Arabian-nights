import { ViewTransition } from 'react'

/**
 * Every screen change is a short move in depth. Links say what kind of move
 * it is (see `transitionTypes` on the links in Nav and ShootBits):
 *   tab-next / tab-prev   screens turn sideways, like the faces of a box
 *   drill-in / drill-out  opening something comes from the front; going back returns it
 *   anything else         the old screen sinks back and the new one rises
 * The styles are in globals.css under "moving between screens".
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'tab-next': 'in-right', 'tab-prev': 'in-left', 'drill-in': 'from-front', 'drill-out': 'from-back', default: 'rise' }}
      exit={{ 'tab-next': 'out-left', 'tab-prev': 'out-right', 'drill-in': 'push-back', 'drill-out': 'to-front', default: 'sink' }}
      default="none"
    >
      <div className="space-y-5">{children}</div>
    </ViewTransition>
  )
}
