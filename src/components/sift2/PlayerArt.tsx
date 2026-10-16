import { PlayerFace } from '../insight';
import { useState } from 'react';
import { teamColors } from '../../lib/teams';
import { broadcastPlayerPhoto, playerFraming, type PlayerArtSurface } from './playerArt';

/** One framing policy for the portrait rail, landscape cards and matchup thumbnails. */
export function PlayerArt({ id, name, team, surface }: {id:string;name:string;team:string;surface:PlayerArtSurface}) {
  const selected=broadcastPlayerPhoto(id,name,team,surface);
  const [failed,setFailed]=useState<string|null>(null);
  const photo=selected?.src===failed ? null : selected;
  const frame=playerFraming(photo,surface);
  const [color]=teamColors('NFL',team);
  return <span className={`pface pface--xl s2-player-art${photo ? ' has-photo' : ''}`} onErrorCapture={()=>setFailed(selected?.src ?? null)} data-photo-state={photo ? 'photo' : selected ? 'unavailable' : 'branded'} data-player-surface={surface} title={photo ? `Photo: ${photo.credit}` : `${team} team artwork · player photograph unavailable`} style={{['--tc' as string]:color,['--player-zoom' as string]:frame.zoom,['--player-focus' as string]:frame.focus}}>
    <PlayerFace key={photo?.src ?? team} photo={photo ? {...photo,focus:frame.focus} : null} team={team} size="xl" name={name} />
  </span>;
}
