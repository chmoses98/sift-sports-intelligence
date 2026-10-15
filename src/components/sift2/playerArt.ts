import { allPlayerImages, playerPhoto, type PlayerPhoto } from '../../lib/players';
export type PlayerArtSurface = 'portrait' | 'wide' | 'driver';
const images=allPlayerImages();
/** Broadcast curation is stricter than source/licence eligibility. Keep weak warm-up framing out of featured art. */
export function broadcastPlayerPhoto(id: string, name: string, team: string, surface: PlayerArtSurface = 'wide') {
  const photo = playerPhoto(id, name, team, surface==='portrait' ? ['control','portrait','lead'] : ['lead', 'control', 'pull-away']);
  const asset=photo && images.find((p)=>photo.src.endsWith(`/${p.id}.webp`));
  // Publication ids alone cannot authorize a former-team uniform.
  return !asset || asset.team!==team || asset.id==='chi-tyson-bagent' ? null : photo;
}

/** Reviewed crops, not interchangeable player images. Never retouch uniforms or synthesize a face. */
export function playerFraming(photo: PlayerPhoto | null, surface: PlayerArtSurface) {
  const id=photo?.src.split('/').pop()?.replace('.webp','');
  if(id==='den-bo-nix') return {focus:'55% 0%',zoom:1};
  if(id==='sf-george-kittle') return {focus:surface==='portrait' ? '50% 20%' : '50% 28%',zoom:surface==='portrait' ? 1.55 : 1.08};
  if(id==='sf-brock-purdy') return {focus:surface==='portrait' ? '50% 12%' : '50% 0%',zoom:1.03};
  return {focus:photo?.focus ?? '50% 20%',zoom:1};
}
