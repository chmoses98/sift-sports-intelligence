// The Game Script deep view: one script at a time — what has to happen, how the simulated game plays
// when it does, which margin markets it settles and which it breaks, the volume lean for each team's
// key players, the opponent-adjusted unit ranks behind it, and what would invalidate it.
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc } from '../../contract/types';
import { TeamMark } from '../../components/ui';
import { teamStat, type PriceRow } from '../../lib/gamedata';
import { routes } from '../../lib/routes';
import { sharePct, type GameScript, type ScriptId, type ScriptSet, type TeamVolume } from '../../lib/scripts';
import { Info, ScriptGlyph, ScriptsPanel, SIM_SHARE_INFO } from './panels';

function rangeText(s: GameScript, set: ScriptSet): string {
  const fav = set.fav === 'home' ? set.homeAbbr : set.awayAbbr;
  const dog = set.fav === 'home' ? set.awayAbbr : set.homeAbbr;
  switch (s.id) {
    case 'fav-big': return `${fav} wins by 14 or more points.`;
    case 'fav': return `${fav} wins by 7 to 13 points.`;
    case 'close': return `The final margin is 6 points or fewer either way — including ${dog} winning a one-score game.`;
    case 'dog': return `${dog} wins by 7 or more points.`;
  }
}

const VOL: { k: keyof TeamVolume; label: string; fmt: (v: number) => string }[] = [
  { k: 'plays', label: 'Offensive plays', fmt: (v) => v.toFixed(1) },
  { k: 'passAtt', label: 'Pass attempts', fmt: (v) => v.toFixed(1) },
  { k: 'rushAtt', label: 'Rush attempts', fmt: (v) => v.toFixed(1) },
  { k: 'passRate', label: 'Pass rate', fmt: (v) => `${Math.round(v * 100)}%` },
];

function Delta({ v, base, pct }: { v: number | null; base: number | null; pct?: boolean }) {
  if (v == null || base == null || base === 0) return null;
  const d = pct ? (v - base) * 100 : ((v - base) / base) * 100;
  const r = Math.round(d);
  if (r === 0) return <span className="delta delta--flat">±0{pct ? ' pts' : '%'}</span>;
  return <span className={`delta delta--${r > 0 ? 'up' : 'down'}`}>{r > 0 ? '▲' : '▼'} {Math.abs(r)}{pct ? ' pts' : '%'}</span>;
}

function VolumeTable({ s, set }: { s: GameScript; set: ScriptSet }) {
  const teams: ['away' | 'home', string][] = [['away', set.awayAbbr], ['home', set.homeAbbr]];
  return (
    <table className="dtable voltab">
      <caption>Simulated volume in games that end this way, against every simulated game</caption>
      <thead>
        <tr><th scope="col" /><th scope="col" className="r">{set.awayAbbr}</th><th scope="col" className="r">{set.homeAbbr}</th></tr>
      </thead>
      <tbody>
        {VOL.map((v) => (
          <tr key={v.k}>
            <th scope="row">{v.label}</th>
            {teams.map(([side]) => {
              const x = s.volume[side][v.k];
              const base = set.overall[side][v.k];
              return (
                <td key={side} className="r">
                  <span className="num">{x != null ? v.fmt(x) : '—'}</span> <Delta v={x} base={base} pct={v.k === 'passRate'} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MarketList({ rows, slug, eventId, empty }: { rows: PriceRow[]; slug: string; eventId: string; empty: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="slist">
      {rows.map((r) => (
        <li key={r.m.market_id}>
          <Link to={routes.market(slug, r.m.market_id, eventId)} className="slist__row">
            <span>{r.label}</span>
            <span className="num slist__p">{r.ask != null ? `${Math.round(r.ask * 100)}¢` : '—'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function rankWord(rank: number | null) {
  return rank == null ? '—' : `#${rank}`;
}

const UNIT_ROWS: { off: string; def: string; label: string }[] = [
  { off: 'met_nfl.adj_off_epa', def: 'met_nfl.adj_def_epa', label: 'Overall' },
  { off: 'met_nfl.adj_off_db_epa', def: 'met_nfl.adj_def_db_epa', label: 'Passing' },
  { off: 'met_nfl.adj_off_rush_epa', def: 'met_nfl.adj_def_rush_epa', label: 'Rushing' },
];

function UnitEvidence({ offProf, defProf, offAbbr, defAbbr, sportCode }: { offProf?: EntityProfileDoc | null; defProf?: EntityProfileDoc | null; offAbbr: string; defAbbr: string; sportCode: string }) {
  return (
    <div className="unitev">
      <div className="unitev__h">
        <span><TeamMark sport={sportCode} abbr={offAbbr} size="sm" /> {offAbbr} offense</span>
        <span className="muted">vs</span>
        <span>{defAbbr} defense <TeamMark sport={sportCode} abbr={defAbbr} size="sm" /></span>
      </div>
      {UNIT_ROWS.map((u) => {
        const o = teamStat(offProf, u.off);
        const d = teamStat(defProf, u.def);
        return (
          <div key={u.label} className="unitev__row">
            <span className={`unitev__r${o.rank != null && o.rank <= 8 ? ' is-top' : ''}`}>{rankWord(o.rank)}</span>
            <span className="unitev__l">{u.label}</span>
            <span className={`unitev__r${d.rank != null && d.rank <= 8 ? ' is-top' : ''}`}>{rankWord(d.rank)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ScriptTab({ r, set, selected, hrefFor, rows, slug, eventId, homeProf, awayProf, sportCode }: {
  r: EventResearchDoc; set: ScriptSet; selected: ScriptId | null; hrefFor: (id: ScriptId | null) => string; rows: PriceRow[]; slug: string; eventId: string;
  homeProf?: EntityProfileDoc | null; awayProf?: EntityProfileDoc | null; sportCode: string;
}) {
  const s = set.scripts.find((x) => x.id === selected) ?? [...set.scripts].sort((a, b) => b.share - a.share)[0];
  const i = set.scripts.indexOf(s);
  const priced = rows.filter((x) => x.fit && x.ask != null && x.ask > 0.03 && x.ask < 0.97);
  const wins = priced.filter((x) => x.fit!.fits[i] === 'yes').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0)).slice(0, 6);
  const loses = priced.filter((x) => x.fit!.fits[i] === 'no').sort((a, b) => (b.ask ?? 0) - (a.ask ?? 0)).slice(0, 6);
  const leader = s.leader ?? set.fav;
  const trailer = leader === 'home' ? 'away' : 'home';
  const abbr = { home: set.homeAbbr, away: set.awayAbbr };
  const prof = { home: homeProf, away: awayProf };
  const homeP = r.participants.find((p) => p.home_away === 'HOME')!;
  const players = (side: 'home' | 'away', role: string) => {
    const tid = side === 'home' ? homeP.participant_id : r.participants.find((p) => p.home_away === 'AWAY')!.participant_id;
    return r.players.filter((p) => p.team_id === tid && p.role === role);
  };
  const lean = (side: 'home' | 'away', k: 'passAtt' | 'rushAtt') => {
    const v = s.volume[side][k];
    const b = set.overall[side][k];
    return v != null && b ? (v - b) / b : null;
  };
  const leanWord = (x: number | null) => (x == null ? 'no change' : Math.abs(x) < 0.03 ? 'about the same volume' : `${x > 0 ? 'more' : 'less'} volume (${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%)`);
  return (
    <div className="stab">
      <ScriptsPanel set={set} selected={s.id} hrefFor={(id) => hrefFor(id ?? s.id)} title="Choose a script" compact />
      <section className={`panel stab__main scard--s${s.index}`} aria-labelledby="stab-h">
        <header className="stab__head">
          <ScriptGlyph id={s.id} />
          <div>
            <h2 className="stab__name" id="stab-h">{s.name}</h2>
            <p className="stab__need">{rangeText(s, set)}</p>
          </div>
          <div className="stab__share">
            <span className="num">{sharePct(s.share)}</span>
            <span>sim share <Info label="What is sim share?">{SIM_SHARE_INFO}</Info></span>
          </div>
        </header>

        <div className="stab__grid">
          <div className="stab__block">
            <h3 className="stab__h">How the game plays</h3>
            <VolumeTable s={s} set={set} />
          </div>
          <div className="stab__block">
            <h3 className="stab__h">Player volume lean</h3>
            <ul className="lean">
              {(['away', 'home'] as const).map((side) => (
                <li key={side}>
                  <span className="lean__t"><TeamMark sport={sportCode} abbr={abbr[side]} size="sm" /> {abbr[side]}</span>
                  <span>Passing game{players(side, 'QB')[0] ? ` (${players(side, 'QB')[0].display_name})` : ''}: <b>{leanWord(lean(side, 'passAtt'))}</b></span>
                  <span>Run game{players(side, 'RB')[0] ? ` (${players(side, 'RB').slice(0, 2).map((p) => p.display_name).join(', ')})` : ''}: <b>{leanWord(lean(side, 'rushAtt'))}</b></span>
                </li>
              ))}
            </ul>
            <p className="muted small">Team attempts in this script against the simulation's overall mean. Player shares are not split by script in the publication.</p>
          </div>
          <div className="stab__block">
            <h3 className="stab__h">Markets that win</h3>
            <MarketList rows={wins} slug={slug} eventId={eventId} empty="No priced margin market wins in every game of this script." />
          </div>
          <div className="stab__block">
            <h3 className="stab__h">Markets that lose</h3>
            <MarketList rows={loses} slug={slug} eventId={eventId} empty="No priced margin market loses in every game of this script." />
          </div>
          <div className="stab__block">
            <h3 className="stab__h">Matchup evidence <Info label="About these ranks">League ranks (of 32) of the opponent-adjusted ratings. For defenses, #1 allows the least. Ranks show strength against strength; Sift does not combine them into one number (see the Matchup tab).</Info></h3>
            <UnitEvidence offProf={prof[leader]} defProf={prof[trailer]} offAbbr={abbr[leader]} defAbbr={abbr[trailer]} sportCode={sportCode} />
            {s.id === 'close' && <UnitEvidence offProf={prof[trailer]} defProf={prof[leader]} offAbbr={abbr[trailer]} defAbbr={abbr[leader]} sportCode={sportCode} />}
          </div>
          <div className="stab__block">
            <h3 className="stab__h">What breaks it</h3>
            <ul className="breaks">
              {set.scripts.filter((x) => x.id !== s.id).map((x) => (
                <li key={x.id}><Link to={hrefFor(x.id)} className={`breaks__a scard--s${x.index}`}><i aria-hidden="true" />{x.name}<span className="num">{sharePct(x.share)}</span></Link></li>
              ))}
            </ul>
            <p className="muted small">{sharePct(1 - s.share)} of simulated games end another way.</p>
          </div>
        </div>
        {set.notSimulated.length > 0 && <p className="muted small stab__foot">The simulation models the final margin and total only; it does not simulate {set.notSimulated.join(', ')}.</p>}
      </section>
    </div>
  );
}
