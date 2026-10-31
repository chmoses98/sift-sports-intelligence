// The research sections of Matchup Intelligence. Each takes one slice of `GameIntel` (data/intel/build.ts) and prints it; none of them
// decides whether it exists (the builder does), and none computes a number. Copy that explains a statistic lives in model/intel/advantages.ts.
import { Link } from '../../../routing';
import type { Comparison, GameIntel, IntelNotes } from '../../data/intel/build';
import { nicknames } from '../../data/intel/build';
import type { Environment } from '../../data/intel/environment';
import type { ScriptCard, ScriptIntel } from '../../data/intel/scriptIntel';
import type { SportBlock, SportRow } from '../../data/intel/sports';
import type { KeyMatchup } from '../../data/research/keyMatchups';
import { ordinal, type UnitRow } from '../../data/research/matchup';
import { ADVANTAGE_NOTE, UNIT_COPY, type Advantage } from '../../model/intel/advantages';
import { designationTiming } from '../../../lib/injurySource';
import { dayClock } from '../../model/time';
import { PlayerLink, StatLink, TeamLink } from '../../nav/Targets';
import { TeamLogo } from '../../ui/TeamLogo';
import { MATCHUP_WINDOW } from '../../data/research/matchup';
import { Avatar, type GameCtx } from '../GameShared';
import { RankBars } from './RankBars';

const Head = ({ title, note }: { title: string; note?: string }) => <div className="mx-sh"><h2>{title}</h2>{note && <span className="x-note">{note}</span>}</div>;

// ------------------------------------------------------------------------------------------------------------------ top advantages

export function AdvantageCard({ a }: { a: Advantage }) {
  return (
    <li className="mi-adv" data-testid="intel-advantage" data-strength={a.strength}>
      <p className="mi-adv__h">{a.headline}</p>
      <p className="mi-adv__d">{a.detail}</p>
      <RankBars bars={a.bars} ariaLabel={`${a.headline} League ranks`} />
      <p className="mi-adv__i"><b>What it implies.</b> {a.implies}</p>
      <details className="mi-more">
        <summary>About this statistic</summary>
        <p><b>What it measures.</b> {a.meaning}</p>
        <p><b>Why it matters.</b> {a.why}</p>
      </details>
    </li>
  );
}

export function AdvantagesSection({ ctx, intel }: { ctx: GameCtx; intel: GameIntel }) {
  const { g } = ctx;
  const names = nicknames(g);
  return (
    <div className="x-card mx-sec" role="region" aria-label="Top matchup advantages" data-testid="intel-advantages">
      <Head title="Top matchup advantages" note={intel.advantages.length ? 'opponent-adjusted' : undefined} />
      {intel.advantages.length > 0 ? (
        <>
          <ol className="mi-advs">{intel.advantages.map((a) => <AdvantageCard key={a.id} a={a} />)}</ol>
          <p className="x-note mi-foot">{ADVANTAGE_NOTE}</p>
        </>
      ) : (
        <ul className="mi-finds">
          {intel.findings.map((f) => (
            <li key={f.id}><b>{f.title}</b><span>{f.text}</span><small>{f.basis === 'OPPONENT_ADJUSTED' ? 'Opponent-adjusted' : f.basis === 'MODEL' ? 'Model' : f.basis === 'AVAILABILITY' ? 'Availability' : f.basis === 'CONTEXT' ? 'Context' : 'Raw'} · {f.team ? names.nick(f.team) : 'both teams'}</small></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ comparison

function rankCell(o: UnitRow['o'], win: boolean) {
  return (
    <td className={win ? 'is-win' : undefined}>
      <b className="num">{ordinal(o.rank)}</b>
      <span className="mi-ct" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, o.pct))}%` }} /></span>
    </td>
  );
}

export function ComparisonSection({ ctx, comparison }: { ctx: GameCtx; comparison: Comparison }) {
  const { g } = ctx;
  if (comparison.kind === 'units') {
    const away = new Map(comparison.rowsAway.map((r) => [r.unit.id, r]));
    const home = new Map(comparison.rowsHome.map((r) => [r.unit.id, r]));
    const ids = [...new Set([...comparison.rowsAway, ...comparison.rowsHome].map((r) => r.unit.id))].filter((id) => UNIT_COPY[id]);
    const n = (comparison.rowsAway[0] ?? comparison.rowsHome[0])?.o.n;
    return (
      <div className="x-card mx-sec" role="region" aria-label="Offense and defense comparison" data-testid="intel-comparison">
        <Head title="Offense vs defense" note={n ? `league rank, 1 = best of ${n}` : undefined} />
        <table className="mi-tbl">
          <caption className="sr">League rank of each offense and the defense it faces, opponent-adjusted. A shaded rank is the advantaged side.</caption>
          <thead>
            <tr><th scope="col">Unit</th><th scope="col">{g.away.abbr} offense</th><th scope="col">{g.home.abbr} defense</th><th scope="col">{g.home.abbr} offense</th><th scope="col">{g.away.abbr} defense</th></tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const a = away.get(id), h = home.get(id);
              return (
                <tr key={id}>
                  <th scope="row">{(a ?? h)!.unit.title}</th>
                  {a ? <>{rankCell(a.o, a.tilt === 'off')}{rankCell(a.d, a.tilt === 'def')}</> : <><td>—</td><td>—</td></>}
                  {h ? <>{rankCell(h.o, h.tilt === 'off')}{rankCell(h.d, h.tilt === 'def')}</> : <><td>—</td><td>—</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="x-note mi-foot">Opponent-adjusted, season-long. Shaded: that side leads its matchup by more than 15 percentile points. Full charts are on the Matchup tab.{comparison.note ? ` ${comparison.note}` : ''}</p>
      </div>
    );
  }
  if (comparison.kind === 'values') {
    return (
      <div className="x-card mx-sec" role="region" aria-label="Team comparison" data-testid="intel-comparison">
        <Head title="Team comparison" note="published values" />
        <table className="mi-tbl mi-tbl--g">
          <caption className="sr">Published values for each side, with no league rank</caption>
          <thead><tr><th scope="col">Statistic</th><th scope="col">{g.away.abbr}</th><th scope="col">{g.home.abbr}</th></tr></thead>
          <tbody>
            {comparison.rows.map((r) => (
              <tr key={r.id}><th scope="row">{r.name}</th><td><b className="num">{r.away}</b></td><td><b className="num">{r.home}</b></td></tr>
            ))}
          </tbody>
        </table>
        {comparison.note && <p className="x-note mi-foot">{comparison.note}</p>}
      </div>
    );
  }
  return (
    <div className="x-card mx-sec" role="region" aria-label="Team comparison" data-testid="intel-comparison">
      <Head title="Team comparison" note={comparison.adjusted ? 'includes opponent-adjusted' : 'league ranks'} />
      <table className="mi-tbl mi-tbl--g">
        <caption className="sr">Published team statistics with each team’s league rank</caption>
        <thead><tr><th scope="col">Statistic</th><th scope="col">{g.away.abbr}</th><th scope="col">{g.home.abbr}</th></tr></thead>
        <tbody>
          {comparison.pairs.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.route ? <Link to={p.route}>{p.name}</Link> : p.name}</th>
              <td><b className="num">{p.away.value}</b><small>{p.away.rank != null ? `${ordinal(p.away.rank)}${p.away.n ? ` of ${p.away.n}` : ''}` : ''}</small></td>
              <td><b className="num">{p.home.value}</b><small>{p.home.rank != null ? `${ordinal(p.home.rank)}${p.home.n ? ` of ${p.home.n}` : ''}` : ''}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="x-note mi-foot">The largest rank gaps the publication states. Ranks are as published; every statistic is on the Stats tab.{comparison.note ? ` ${comparison.note}` : ''}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ mismatches

const defReading = (pct: number) => (pct <= 33 ? 'one of the more generous units in the league' : pct >= 67 ? 'one of the stronger units in the league' : 'a middle-of-the-league unit');

export function mismatchSentence(k: KeyMatchup): string {
  const copy = UNIT_COPY[k.unit.id];
  return `${k.name} (${k.role ? `${k.role}, ` : ''}${k.team}) meets the ${k.oppTeam} ${k.unit.id === 'rush' ? 'run' : 'pass'} defense: ${ordinal(k.oppSide.rank)} of ${k.oppSide.n} in ${copy?.defStat ?? k.unit.dL}, ${defReading(k.oppSide.pct)}.`;
}

export function MismatchSection({ ctx, items }: { ctx: GameCtx; items: KeyMatchup[] }) {
  const { g } = ctx;
  return (
    <div className="x-card mx-sec" role="region" aria-label="Player and positional mismatches" data-testid="intel-mismatches">
      <Head title="Player matchups" note="player ↔ opposing unit" />
      <ul className="mi-list">
        {items.map((k) => (
          <li key={k.playerId} className="mi-pl">
            <PlayerLink player={{ slug: g.slug, id: k.playerId }} state={{ stat: k.stat, line: k.line }} className="mx-av" label={`${k.name}: player research`}><Avatar k={k} g={g} /></PlayerLink>
            <div className="mi-pl__t">
              <p>{mismatchSentence(k)}</p>
              <StatLink stat={{ slug: g.slug, statId: k.unit.def }} state={{ win: MATCHUP_WINDOW, sel: k.oppTeam, opp: k.team }} className="mi-link" label={`${k.oppTeam} defense ${k.unit.unit}, ${ordinal(k.oppSide.rank)} of ${k.oppSide.n}: league ranking`}>See the league ranking</StatLink>
            </div>
          </li>
        ))}
      </ul>
      <p className="x-note mi-foot">Players are the ones Kalshi lists the most props for in a statistic that meets this unit. Descriptive, not a projection of his result.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ lineup, injury, roster notes

export function NotesSection({ ctx, notes }: { ctx: GameCtx; notes: IntelNotes }) {
  const { g } = ctx;
  const team = (code: string | null) => (code === g.away.abbr ? g.away : code === g.home.abbr ? g.home : null);
  const timing = designationTiming(g.sport);
  // The capture is printed as the time it was taken, never as an age: a list's age is the reader's to judge from the time.
  const capturedMs = notes.source?.asOf ? Date.parse(notes.source.asOf) : NaN;
  const captured = Number.isFinite(capturedMs) ? dayClock(capturedMs, Date.now(), undefined, ', ') : null;
  return (
    <div className="x-card mx-sec" role="region" aria-label="Lineup and injury notes" data-testid="intel-notes">
      <Head title="Lineup and injury notes" note={notes.source?.name} />
      <ul className="mi-list">
        {notes.items.map((n) => {
          const t = team(n.team);
          return (
            <li key={n.id} className="mi-nt">
              {t ? <TeamLink team={{ slug: t.slug, id: t.id }} className="mx-av mx-av--plain" label={`${t.name}: Team Research`}><TeamLogo team={t} size={30} /></TeamLink> : <span className="mx-av__none" aria-hidden="true" />}
              <div className="mi-nt__t"><b>{n.headline}</b>{n.detail && <span>{n.detail}</span>}</div>
            </li>
          );
        })}
      </ul>
      <p className="x-note mi-foot">
        {notes.source ? `${notes.source.name}${captured ? `, captured ${captured}` : ''}.` : ''}{notes.source?.caveat ? ` ${notes.source.caveat}` : ''}{timing ? ` ${timing}` : ''}{notes.more > 0 ? ` ${notes.more} more designation${notes.more === 1 ? '' : 's'} are on the team pages.` : ''}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ scoring environment

export function EnvironmentSection({ env }: { env: Environment }) {
  return (
    <div className="x-card mx-sec" role="region" aria-label="Pace and scoring environment" data-testid="intel-environment">
      <Head title="Pace and scoring" note="model and season" />
      <dl className="mi-env">
        {env.lines.map((l) => (
          <div key={l.id}>
            <dt>{l.label}<i className={`mi-src mi-src--${l.source}`}>{l.source === 'simulation' ? 'Simulation' : l.source === 'model' ? 'Model' : 'Season'}</i></dt>
            <dd>{l.text}</dd>
          </div>
        ))}
      </dl>
      {env.notSimulated.length > 0 && <p className="x-note mi-foot">Not simulated: {env.notSimulated.join('; ')}.</p>}
      {env.foot && <p className="x-note mi-foot">{env.foot}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the sport's own research cards

const SRC_WORD: Record<SportRow['source'], string> = { simulation: 'Simulation', season: 'Season', status: 'Published status', model: 'Model' };

/** One card of a sport's own research (starters and lineups, rotations, surface and form, attack against defence): published statements with their kind and source line. */
export function SportBlockCard({ block }: { block: SportBlock }) {
  return (
    <div className="x-card mx-sec" role="region" aria-label={block.title} data-testid={`intel-block-${block.id}`}>
      <Head title={block.title} note={block.note} />
      <dl className="mi-env">
        {block.rows.map((r) => (
          <div key={r.id}>
            <dt>{r.label}<i className={`mi-src mi-src--${r.source}`}>{SRC_WORD[r.source]}</i></dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
      {block.foot && <p className="x-note mi-foot">{block.foot}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ scripts

const ROLE: Record<ScriptCard['role'], string> = { expected: 'Expected script', alternate: 'Alternate script', danger: 'Danger script' };
function ScriptCardView({ c }: { c: ScriptCard }) {
  return (
    <li className={`mi-sc mi-sc--${c.role}`} data-testid={`intel-script-${c.role}`}>
      <div className="mi-sc__h"><i className="mi-sc__tag">{ROLE[c.role]}</i>{c.share != null && <span className="num">{Math.round(c.share * 100)}% of simulated games</span>}</div>
      <p className="mi-sc__help">{c.help}.</p>
      <p className="mi-sc__t">{c.title}</p>
      <p className="mi-sc__l">{c.line}</p>
      {c.evidence.length > 0 && <><p className="mi-sc__k">Evidence</p><ul className="mi-bul">{c.evidence.map((e) => <li key={e}>{e}</li>)}</ul></>}
      {c.counter.length > 0 && <><p className="mi-sc__k">Counterargument</p><ul className="mi-bul">{c.counter.map((e) => <li key={e}>{e}</li>)}</ul></>}
    </li>
  );
}

export function ScriptSection({ script }: { script: ScriptIntel }) {
  return (
    <div className="x-card mx-sec" role="region" aria-label="Expected, alternate and danger game scripts" data-testid="intel-script">
      <Head title="Game script" note="what the publication states" />
      {script.thesisSummary && <p className="mi-thesis">{script.thesisSummary}</p>}
      <ul className="mi-scs">{script.cards.map((c) => <ScriptCardView key={`${c.role}-${c.title}`} c={c} />)}</ul>
      <p className="x-note mi-foot">
        {script.basis}{script.notSimulated.length ? ` Not simulated: ${script.notSimulated.join('; ')}.` : ''} Research context, not a bet signal.
      </p>
    </div>
  );
}
