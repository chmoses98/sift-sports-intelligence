# CinematicHero — acceptance checklist

Component: `src/components/sift2/CinematicHero.tsx`

- Opt-in component, not yet mounted in production routes.
- Uses real image URLs only when caller supplies verified/licensed imagery; branded gradient fallback otherwise.
- Image is decorative because the same event identity must be rendered in accessible text.
- Responsive breakpoint at 720px; desktop/mobile focus supplied separately.
- No simulated score, market price, weather, venue, or team identity is generated.
- Works without a supplied photo; does not substitute an invented stadium.
- No live data fetches or research semantics.

## Before merging into `sift-2.0`
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Render desktop 1440px and mobile 390px screenshots using real approved venue artwork and compare to design references.
- [ ] Check 320px overflow, 200% zoom, keyboard focus, screen reader heading structure and reduced motion.
- [ ] Confirm no changes to existing game pages and publication/quote behavior.
- [ ] Review image rights, credits, crops and fallback.

This change does not claim visual acceptance or passing CI.
