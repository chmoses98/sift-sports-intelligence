// The designed stand-in for a venue without a curated photograph: a night bowl under floodlights —
// light banks and beams over a glowing pitch, the stands as a dark ring, the venue's name on an LED
// fascia, a breath of the home team's colour and fine grain. Purely decorative (aria-hidden); it is
// meant to read as an intentional image, never as "picture missing".

export function StadiumFallback({ venue, compact, rink }: { venue?: string | null; compact?: boolean; rink?: boolean }) {
  return (
    <span className={`sfb${compact ? ' sfb--compact' : ''}${rink ? ' sfb--rink' : ''}`} aria-hidden="true">
      <span className="sfb__beams" />
      <span className="sfb__lights" />
      <span className="sfb__bowl" />
      <span className="sfb__field" />
      {venue && !compact && (
        <span className="sfb__fascia">
          <span>{venue}</span>
        </span>
      )}
      <span className="sfb__grain" />
    </span>
  );
}
