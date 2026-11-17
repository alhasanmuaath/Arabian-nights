/** The night sky behind every screen: two star layers and a moon glow at different depths. */
export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <i className="sky-stars far" />
      <i className="sky-stars near" />
      <i className="sky-moon" />
    </div>
  )
}
