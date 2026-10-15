import { playerPhoto } from '../../lib/players';
/** Broadcast curation is stricter than source/licence eligibility. Keep weak warm-up framing out of featured art. */
export function broadcastPlayerPhoto(id: string, name: string, team: string) {
  const photo = playerPhoto(id, name, team, ['lead', 'control', 'pull-away']);
  return photo?.src.includes('/chi-tyson-bagent.webp') ? null : photo;
}
