// BL-8: a label that shortens on a phone (the `phone:` variant) — e.g.
// "Isometric" → "Iso" on a preview button.
export function PhoneLabel({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="phone:hidden">{full}</span>
      <span className="hidden phone:inline">{short}</span>
    </>
  )
}
