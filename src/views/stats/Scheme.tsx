// SCHEME on screen. SchemeBoard: each team's tendencies with a tendency word, its rank among teams with enough
// charted plays, and a strip showing where both teams sit in the league. SchemePlayers: each unusual tendency
// connected to the player it shapes, his published projection, the simulated script that moves his volume, and the
// market on him — with the bet status read from the publication's own opportunity layer, never inferred.
import { Link } from 'react-router';
import type { Opportunity } from '../../opportunity/types';
import { BasisTag, PercentileStrip } from '../../components/statviz';
import { PlayerFace } from '../../components/insight';
import { TeamMark } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { tendencyWord, type SchemeRow } from '../../insights/schemeBoard';
import type { SchemeLink } from '../../insights/schemePlayers';
import { valueText } from '../../insights/props';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { teamAccent } from '../../lib/teams';
import '../../styles/lane-c-views.css';

export function SchemeBoard({ rows, teams, caption }: { rows: SchemeRow[]; teams: { abbr: string; nick: string }[]; caption?: string }) {
  const group = (side: 'off' | 'def', title: string) => {
    const xs = rows.filter((r) => r.side === side);
    if (!xs.length) return null;
    return (
      <div className="scb__g">
        <h3 className="scb__h">{title}</h3>
        <ul className="scb__l">
          {xs.map((r) => {
            const marks = teams
              .map((t) => ({ t, c: r.cells[t.abbr] }))
              .filter((x) => x.c?.pos != null)
              .map((x) => ({ abbr: x.t.abbr, color: teamAccent('NFL', x.t.abbr), pos: x.c!.pos!, text: `${x.c!.text}, #${x.c!.rank} of ${x.c!.of}` }));
            return (
              <li key={r.key} className="scb__i">
                <div className="scb__k">
                  <b>{r.label}</b>
                  <small>{r.per}{' '}{r.source === 'ftn' ? <BasisTag basis="box">FTN charted</BasisTag> : null}</small>
                </div>
                <div className="scb__vals">
                  {teams.map((t) => {
                    const c = r.cells[t.abbr];
                    return (
                      <span key={t.abbr} className="scb__v" style={{ ['--tc' as string]: teamAccent('NFL', t.abbr) }}>
                        <TeamMark sport="NFL" abbr={t.abbr} size="sm" />
                        <b className="num">{c?.text ?? '—'}</b>
                        <small>{c ? (r.quality ? (c.rank != null ? `#${c.rank} of ${c.of}` : 'not ranked') : tendencyWord(c.rank, c.of)) : 'not published'}{c?.sample && c.value == null ? ` · ${c.sample}, too few` : ''}</small>
                      </span>
                    );
                  })}
                </div>
                {marks.length > 0 && <PercentileStrip marks={marks} low={r.quality ? 'Worst' : 'Lowest'} high={r.quality ? 'Best' : 'Highest'} label={r.label} neutral={!r.quality} />}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <div className="scb">
      {group('off', 'Offense tendencies')}
      {group('def', 'Defense tendencies')}
      {caption && <p className="lc-fine">{caption}</p>}
    </div>
  );
}

/** The bet status of a market, from the publication's own opportunity layer only. */
export function betStatus(opps: Opportunity[], marketId: string | null | undefined): { cls: string; word: string; title: string } {
  const o = marketId ? opps.find((x) => x.marketId === marketId) : undefined;
  if (o?.status === 'ACTIONABLE') return { cls: 'bet', word: 'Validated bet', title: o.statusReason };
  if (o?.status === 'RESEARCH_CANDIDATE') return { cls: 'research', word: 'Research candidate', title: o.statusReason };
  if (o?.status === 'PASS') return { cls: 'none', word: 'Judged: no bet', title: o.statusReason };
  return { cls: 'none', word: 'No bet flagged', title: 'The publication flags no opportunity on this market; this link is research, not a pick.' };
}

export function SchemePlayers({ links, slug, eventId, opps }: { links: SchemeLink[]; slug: string; eventId: string; opps: Opportunity[] }) {
  if (!links.length) return <p className="muted small">No charted tendency in this game is unusual enough to connect to a player.</p>;
  return (
    <div className="lc-grid lc-grid--2">
      {links.map((l) => {
        const p = l.player;
        const status = betStatus(opps, l.prop?.market?.market_id);
        const unit = l.projection?.unit ?? 'yds';
        return (
          <article key={l.id} className="spl lc-card" style={{ ['--tc' as string]: teamAccent('NFL', l.defense.abbr) }}>
            <header className="spl__h">
              <span className="lc-kicker"><TeamMark sport="NFL" abbr={l.defense.abbr} size="sm" /> {l.kind === 'proe' ? `${l.offense.abbr} offense` : `${l.defense.abbr} defense`} · {l.kind === 'box' ? 'Box counts' : l.kind === 'blitz' ? 'Blitz' : 'Pass rate over expected'}</span>
              <h3 className="spl__t">{l.headline}</h3>
            </header>
            <ol className="spl__chain">
              <li className="spl__step">
                <span className="spl__sk"><span className="lc-tier lc-tier--obs">Scheme · observation</span></span>
                <p>{l.scheme} <span className="muted">({l.sample})</span></p>
                {l.evidence.length > 0 && <ul className="spl__ev">{l.evidence.map((e) => <li key={e}>{e}</li>)}</ul>}
              </li>
              {p && (
                <li className="spl__step spl__step--player">
                  <span className="spl__sk"><span className="lc-tier lc-tier--model">Player · publication projection</span></span>
                  <Link to={routes.player(slug, p.pid)} className="spl__who">
                    <PlayerFace photo={playerPhoto(p.pid, p.name, l.offense.abbr)} team={l.offense.abbr} size="sm" />
                    <span><b>{p.name}</b><small>{l.offense.abbr} {p.role}</small></span>
                  </Link>
                  {l.projection && (
                    <p className="spl__proj">
                      {l.projection.label}: <b className="num">{valueText(l.projection.mean, unit)}</b>
                      {l.projection.typical && <span className="muted"> · typical {Math.round(l.projection.typical[0])}–{Math.round(l.projection.typical[1])}</span>}
                      <span className="muted"> · research simulation, not a forecast Sift validates</span>
                    </p>
                  )}
                </li>
              )}
              {l.script && (
                <li className="spl__step">
                  <span className="spl__sk"><span className="lc-tier lc-tier--model">Game script · simulation</span></span>
                  <p>{l.script} <Link to={routes.game(slug, eventId, { tab: 'script' })}>Scripts <Icon name="arrowRight" size={12} /></Link></p>
                </li>
              )}
              <li className="spl__step">
                <span className="spl__sk"><span className={`lc-tier lc-tier--${status.cls}`} title={status.title}>Market · {status.word}</span></span>
                {l.prop?.market && l.prop.line != null ? (
                  <p>
                    <Link to={routes.market(slug, l.prop.market.market_id, eventId)}>{l.prop.marketTitle ?? `${p?.name} ${l.projection?.label.toLowerCase()}`}</Link>
                    <span className="muted"> · line {l.prop.line}</span>
                  </p>
                ) : <p className="muted">No priced {l.projection?.label.toLowerCase() ?? ''} market on {p?.name ?? 'this player'} in this game.</p>}
                {p && l.projection && <p><Link className="spl__go" to={routes.props(slug, { game: eventId, player: p.pid, stat: l.projection.stat })}>Open in the prop explorer <Icon name="arrowRight" size={12} /></Link></p>}
              </li>
            </ol>
          </article>
        );
      })}
    </div>
  );
}
