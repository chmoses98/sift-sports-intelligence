// Shared pieces of the v4 Props screens: the player avatar (verified photo, else the team's own mark) and the compact
// player row used by the Prop Explorer and a game's Players tab.
import type { CSSProperties } from 'react';
import { Link } from '../routing';
import { Icon } from './Icon';
import { PMark } from '../views/broadcast/parts';
import { broadcastPlayerPhoto } from '../components/sift2/playerArt';
import { fmtValue } from '../insights/propBoard';
import { teamColors } from '../lib/teams';

import { modelFigure, propHref, quoteView, statShort, type PlayerEntry } from './propsModel';

/** Verified player photo (identity-checked by broadcastPlayerPhoto) or the team's own mark: never initials, never a silhouette. */
export function PlayerAvatar({ id, name, team, sport, size = 56, surface = 'portrait' }: { id: string; name: string; team: string; sport: string; size?: number; surface?: 'portrait' | 'wide' }) {
  const photo = broadcastPlayerPhoto(id, name, team, surface);
  const [c] = teamColors(sport, team);
  const style: CSSProperties = { width: size, height: size, ['--ring' as string]: c };
  return (
    <span className="v4-av" style={style} data-photo={photo ? 'verified' : 'team-mark'}>
      {photo
        ? <img src={photo.src} alt="" style={{ objectPosition: photo.focus }} loading="lazy" decoding="async" />
        : <span className="v4-av__mark"><PMark sport={sport} p={{ participant_id: team, display_name: team, short_name: team, participant_type: 'TEAM' }} size="sm" /></span>}
    </span>
  );
}

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

/** One player, one line: photo, name, role · team vs/at opponent, the Kalshi price beside the model figure, the line. */
export function PlayerRowV4({ e, now, sport = 'NFL', slug = 'nfl' }: { e: PlayerEntry; now: number; sport?: string; slug?: string }) {
  const r = e.lead.row;
  const main = r.main;
  const q = quoteView(main?.yesAsk, main?.market.captured_at, now);
  const fmt = (v: number) => fmtValue(v, r.def);
  const m = modelFigure(r, fmt);
  const more = e.rows.filter((d) => d.row.main).length - 1;
  const where = e.team.home ? 'vs' : 'at';
  const label = `${e.name}, ${e.role ?? ''} ${e.team.abbr} ${where} ${e.opp.abbr}. ${r.def.label} line ${r.line ?? 'not priced'}.`
    + `${main ? ` Kalshi over ${cents(q.ask)}${q.executable ? '' : ', not a current quote'}.` : ''} ${m.kind === 'probability' ? `Model ${m.text} over.` : m.text + '.'} Open player.`;
  return (
    <li className="v4-prow">
      <Link to={propHref(slug, e.eventId, e.playerId, r.def.stat)} className="v4-prow__link" aria-label={label}>
        <PlayerAvatar id={e.playerId} name={e.name} team={e.team.abbr} sport={sport} />
        <span className="v4-prow__t">
          <b>{e.name}</b>
          <span className="v4-prow__m">{e.role ?? '—'} · {e.team.abbr} {where} {e.opp.abbr}{e.injury ? <i className="v4-prow__inj"> · {e.injury.toLowerCase().replace(/_/g, ' ')}</i> : null}</span>
          <span className="v4-prow__c">
            <span className={`v4-kal${q.executable ? '' : ' v4-kal--stale'}`}>Kalshi <b className="num">{main ? cents(q.ask) : '—'}</b>{main && !q.executable && <i>{q.freshness === 'UNKNOWN' ? 'no capture time' : 'stale'}</i>}</span>
            <span className={`v4-mod v4-mod--${m.kind}`}>{m.kind === 'probability' ? <>Model <b className="num">{m.text}</b></> : m.text}</span>
          </span>
          {more > 0 && <span className="v4-prow__more">+{more} more market{more === 1 ? '' : 's'}</span>}
        </span>
        <span className="v4-prow__n"><b className="num">{r.line ?? '—'}</b><small>{statShort(r.def.stat, r.def.label)}</small></span>
        <Icon name="caret-right" size="s" />
      </Link>
    </li>
  );
}
