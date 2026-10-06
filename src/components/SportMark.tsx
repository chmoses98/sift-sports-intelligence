// A sport's mark for navigation: the league's own logo where one universal league exists (NFL, MLB, NBA,
// NHL; NCAA for college football and the PGA Tour mark when fetched — public/leagues/), otherwise Sift's own
// filled sport symbol (soccer ball, tennis ball, fight glove). Recognisable before the label is read; the
// label always sits beside it, so the mark is decorative (aria-hidden).
import leagues from '../lib/league-logos.json';
import { useHeldImage } from '../lib/useImage';
import { Icon } from './Icon';

const HAVE = (leagues as { leagues: Record<string, unknown> }).leagues;

/** Sift's own filled symbol for a sport, or null when the sport has a league mark or no symbol. */
function sportSymbol(slug: string) {
  switch (slug) {
    case 'soccer':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#f4f7fa" />
          <path d="m12 7.2 4.1 3-1.6 4.9h-5L7.9 10.2z" fill="#0d1620" />
          <path d="M12 2v5.2M16.1 10.2l4.9-1.7M14.5 15.1l3 4.2M9.5 15.1l-3 4.2M7.9 10.2 3 8.5" stroke="#0d1620" strokeWidth="1.3" />
          <path d="M8.3 3 12 2l3.7 1-1 2.4h-5.4zM20.8 8.4l.9 3.7-1.5 3.5-2.2-1.3 1-5.1zM17.9 19.6l-3.5 2.2-3.2-.3.3-2.5 4.6-1.2zM3.2 8.4l-.9 3.7 1.5 3.5 2.2-1.3-1-5.1zM6.1 19.6l3.5 2.2 3.2-.3-.3-2.5-4.6-1.2z" fill="#0d1620" />
        </svg>
      );
    case 'tennis':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#cfe94a" />
          <path d="M4.3 5.6c3.4 2.5 3.8 9.9.2 12.9M19.7 5.6c-3.4 2.5-3.8 9.9-.2 12.9" fill="none" stroke="#f7fbe6" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'mma':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8.5C6 5 8.5 3 12 3s6.5 2.2 6.5 6v4.5c0 2-1.2 3.5-3 4V21H8.5v-3.5c-1.6-.6-2.5-2-2.5-3.8z" fill="#d6363f" />
          <path d="M8.5 17.5h7V21h-7z" fill="#f4f7fa" />
          <path d="M9 8.5h6.5M9 11.2h6.5" stroke="#8f1c25" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6 11c-1.6.2-2.5 1.4-2.2 2.8.3 1.5 1.7 2.1 3 1.6" fill="#b82a33" />
        </svg>
      );
    case 'cfb':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="10" ry="6.2" transform="rotate(-35 12 12)" fill="#8a4a24" />
          <path d="M8.2 15.8 15.8 8.2" stroke="#f4f7fa" strokeWidth="1.4" strokeLinecap="round" />
          <path d="m10 12.6 1.4 1.4M11.4 11.2l1.4 1.4M12.8 9.8l1.4 1.4" stroke="#f4f7fa" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'pga':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="19.5" rx="9" ry="2.5" fill="#2f9a5a" />
          <path d="M11 19V3.5" stroke="#f4f7fa" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11.5 3.8 18.5 6.5l-7 2.8z" fill="#e8433f" />
          <circle cx="15.5" cy="18.6" r="1.3" fill="#f4f7fa" />
        </svg>
      );
    default:
      return null;
  }
}

export function SportMark({ slug, icon, size = 22 }: { slug: string; icon: string; size?: number }) {
  const src = HAVE[slug] ? `${import.meta.env.BASE_URL}leagues/${slug}.webp` : null;
  const img = useHeldImage(src);
  const sym = src ? null : sportSymbol(slug);
  return (
    <span className={`sportmark sportmark--${slug}`} style={{ width: size, height: size }} aria-hidden="true">
      {src ? img && <img src={img} alt="" draggable={false} /> : sym ?? <Icon name={icon} size={size} />}
    </span>
  );
}
