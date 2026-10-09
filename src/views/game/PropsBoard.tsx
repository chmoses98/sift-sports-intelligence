// THE PROPS BOARD — the Props tab of an NFL game. Family chips (passing, rushing, receiving, touchdowns), a team
// chip and a priced-lines switch over every player prop of the game, each as one card that opens from a
// one-line read into evidence, price, risk and the other rungs of its ladder. Decision-first and honest: the
// read describes where the published projection sits against the line; the price shows what each side costs
// after Kalshi's fee; confidence is the publication's own scorecard, which rates its prop pricing research only.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Layer, PlayerFace, RangeBar, RankBadge } from '../../components/insight';
import { DigDeeper, TeamMark } from '../../components/ui';
import type { EventDetailDoc, EventResearchDoc, Market, ModelPrice } from '../../contract/types';
import { hitRecord, pregameRows, statDef, windowRows } from '../../history/stats';
import type { PlayerHistoryDoc } from '../../history/types';
import { nameKey } from '../../insights/context';
import type { GameSides } from '../../insights/game';
import { filterBoard, fmtRange, fmtValue, PROP_FAMILY_LABEL, PROP_FAMILY_ORDER, PROP_READ_WORD, propBoard, propScorecardSentence, type PropFamily, type PropRow } from '../../insights/propBoard';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import type { Finding } from '../../research/findings';
import { useScorecard } from '../Scorecard';
import { usePropHistories } from './matters';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

interface Ctx { r: EventResearchDoc; g: GameSides; slug: string; sport: string; label: string }

/** The last five games before this one against today's line (the history layer; lines in the past are not published). */
function LastGames({ row, hist, kickoff, week }: { row: PropRow; hist: PlayerHistoryDoc | null | undefined; kickoff: string; week: number | null }) {
  const def = statDef(row.def.stat);
  if (!def || !hist || row.line == null) return null;
  const rec = hitRecord(windowRows(pregameRows(hist, kickoff, week), 'last5'), def, row.line);
  if (!rec.values.length) return null;
  return (
    <p className="pb__hist">
      <span className="pb__k">Last {rec.values.length}</span>
      {rec.values.map((x) => (
        <span key={x.row.game_id} className={`pcard__g ${x.v > row.line! ? 'is-over' : 'is-under'}`} title={`${x.row.season ?? ''} week ${x.row.week} vs ${x.row.opp}: ${x.v}`}>
          {x.v}<span className="sr-only">{x.v > row.line! ? " (above today's line)" : " (below today's line)"}</span>
        </span>
      ))}
      <span className="pcard__hr">{rec.over} of {rec.values.length} above today's {row.line}</span>
    </p>
  );
}

function ReadPill({ row }: { row: PropRow }) {
  const tone = row.read === 'ABOVE' ? 'above' : row.read === 'BELOW' ? 'below' : row.read === 'ON' ? 'on' : 'none';
  return <span className={`pb__read pb__read--${tone}`}>{PROP_READ_WORD[row.read]}</span>;
}

export function PropRowCard({ row, ctx, hist, scorecard }: { row: PropRow; ctx: Ctx; hist?: PlayerHistoryDoc | null; scorecard: string }) {
  const def = row.def;
  const fmt = (v: number) => fmtValue(v, def).replace(/ \S+$/, '');
  const finding: Finding = {
    key: `prop:${row.id}`, kind: 'prop', sport: ctx.sport, title: `${row.name} ${def.label.toLowerCase()}`,
    statement: `${row.projection != null ? `Projection ${fmtValue(row.projection, def)}` : 'No simulation'}${row.range ? ` (typical ${fmtRange(row.range.typical, def)}, low ${fmt(row.range.full[0])}, high ${fmt(row.range.full[1])})` : ''}${row.line != null ? `; main line ${row.line} (${row.marketTitle})` : ''}${row.main ? `; over ${cents(row.main.yesAsk)} / under ${cents(row.main.noAsk)}` : ''}${row.matchup ? `; matchup: ${row.matchup.label} ${row.matchup.rank.text}` : ''}. ${PROP_READ_WORD[row.read]}. ${scorecard} ${ctx.label}.`,
    href: routes.player(ctx.slug, row.playerId),
    anchor: row.main ? { ref_kind: 'MARKET', id: row.main.market.market_id, extra: { market_id: row.main.market.market_id, event_id: ctx.r.event.event_id } } : { ref_kind: 'PLAYER', id: row.playerId },
    kickoff: ctx.r.event.start_time_utc, eventStatus: ctx.r.event.status,
  };
  const td = def.stat === 'touchdowns';
  const flatRange = row.range ? row.range.typical[0] === row.range.typical[1] : true;
  const why = row.reasons.length ? row.reasons.join(' · ') : row.main ? 'A priced line with a published projection: the numbers are below, nothing here leans.' : 'A projection without a two-sided line: nothing to price.';
  return (
    <article className={`pb__card pb__card--${row.read.toLowerCase()}`} data-family={row.family}>
      <header className="pb__h">
        <Link to={routes.player(ctx.slug, row.playerId)} className="pcard__who">
          <PlayerFace photo={playerPhoto(row.playerId, row.name, row.team.abbr)} team={row.team.abbr} size="md" />
          <span>
            <span className="pcard__n">{row.name}</span>
            <span className="pcard__s">{row.team.abbr} {row.role ?? ''} · {def.label}{row.injury ? <> · <b className="pb__inj">{row.injury.toLowerCase()}</b></> : null}</span>
          </span>
        </Link>
        <ReadPill row={row} />
      </header>

      <dl className="pcard__nums pb__nums">
        <div><dt>{td ? 'Expected TDs' : 'Projection'}</dt><dd className="num">{row.projection != null ? fmtValue(row.projection, def) : '—'}</dd></div>
        <div><dt>Line</dt><dd className="num">{row.line != null ? (td ? (row.main!.threshold <= 1 ? 'Anytime' : `${row.main!.threshold}+`) : row.line) : '—'}</dd></div>
        <div><dt>Over / Under</dt><dd className="num">{row.main ? <>{cents(row.main.yesAsk)} <span className="muted">/</span> {cents(row.main.noAsk)}</> : '—'}</dd></div>
      </dl>
      <p className="pb__why">{why}</p>
      {row.range && row.projection != null && !flatRange && (
        <RangeBar typical={row.range.typical} full={row.range.full} projection={row.projection} line={row.line} format={fmt} label={`${row.name} ${def.label.toLowerCase()} projected range`} />
      )}
      {row.matchup && (
        <p className="pcard__mu"><span>Matchup</span> <TeamMark sport={ctx.sport} abbr={row.opp.abbr} size="sm" /> {row.matchup.label} <RankBadge rank={row.matchup.rank} compact /></p>
      )}
      <LastGames row={row} hist={hist} kickoff={ctx.r.event.start_time_utc} week={ctx.g.week} />

      <Layer summary="Evidence, price, risk and the other lines">
        <div className="pb__deep">
          {row.main && (
            <section className="pb__sec" aria-label="Price">
              <h4 className="pb__sh">Price after Kalshi's fee</h4>
              <ul className="opp__nums">
                <li><span>Over ask</span><b>{cents(row.main.yesAsk)}</b><small>break-even {pct(row.price?.overBreakEven)}</small></li>
                <li><span>Under ask</span><b>{cents(row.main.noAsk)}</b><small>break-even {pct(row.price?.underBreakEven)}</small></li>
                <li><span>Market P(over)</span><b>{pct(row.main.marketP)}</b><small>the quote's own probability</small></li>
                <li><span>Shadow model P(over)</span><b>{pct(row.main.modelP)}</b><small>{row.main.modelState ? row.main.modelState.toLowerCase().replace(/_/g, ' ') : 'not priced'}</small></li>
              </ul>
              <p className="pb__note">Break-even is the ask plus Kalshi's taker fee (round-up of 7% × P × (1 − P)). No bet-up-to is shown: the publication prices no limit for NFL props and Sift does not invent one.</p>
            </section>
          )}
          <section className="pb__sec" aria-label="Confidence">
            <h4 className="pb__sh">Confidence</h4>
            <p className="pb__note">{scorecard}</p>
          </section>
          {row.risks.length > 0 && (
            <section className="pb__sec" aria-label="Risk">
              <h4 className="pb__sh">What could go wrong</h4>
              <ul className="opp__ev">{row.risks.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
          )}
          {row.ladder.length > 1 && (
            <section className="pb__sec" aria-label="Alternatives">
              <h4 className="pb__sh">The other lines</h4>
              <table className="pb__ladder">
                <thead><tr><th scope="col">Line</th><th scope="col" className="r">Over</th><th scope="col" className="r">Under</th><th scope="col" className="r">Market</th><th scope="col" className="r">Model</th></tr></thead>
                <tbody>
                  {row.ladder.map((x) => (
                    <tr key={x.market.market_id} className={row.main?.market.market_id === x.market.market_id ? 'is-main' : undefined}>
                      <th scope="row"><Link to={routes.market(ctx.slug, x.market.market_id, ctx.r.event.event_id)}>{td ? (x.threshold <= 1 ? 'Anytime TD' : `${x.threshold}+ TD`) : `Over ${x.line}`}</Link></th>
                      <td className="r num">{cents(x.yesAsk)}</td><td className="r num">{cents(x.noAsk)}</td><td className="r num">{pct(x.marketP)}</td><td className="r num">{pct(x.modelP)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </Layer>
      <div className="pcard__x">
        {row.main && <Link className="pcard__m" to={routes.market(ctx.slug, row.main.market.market_id, ctx.r.event.event_id)}>{row.marketTitle} →</Link>}
        <DigDeeper finding={finding} compact />
      </div>
    </article>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`skchip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}

export function PropsBoard({ r, g, detail, slug, sport, label, loading }: { r: EventResearchDoc; g: GameSides; detail: Pick<EventDetailDoc, 'markets' | 'model_prices'> | { markets: Market[]; model_prices?: ModelPrice[] } | null | undefined; slug: string; sport: string; label: string; loading: boolean }) {
  const [sp, setSp] = useSearchParams();
  const family = (PROP_FAMILY_ORDER.find((f) => f === sp.get('family')) ?? 'all') as PropFamily | 'all';
  const team = sp.get('team') ?? 'both';
  const [pricedOnly, setPricedOnly] = useState(true);
  const board = useMemo(() => (detail ? propBoard(r, detail, g) : null), [r, detail, g]);
  const rows = useMemo(() => (board ? filterBoard(board.rows, { family, team, pricedOnly }) : []), [board, family, team, pricedOnly]);
  const players = useMemo(() => rows.slice(0, 24).map((x) => ({ name: x.name, team: x.team.abbr })), [rows]);
  const hist = usePropHistories(sport, players);
  const sc = useScorecard();
  const scorecard = propScorecardSentence(sc?.families);
  // Functional update: two quick taps (family, then team) each build on the params the previous one wrote, not on
  // the render they were born in — otherwise the second tap drops the first.
  const set = (k: string, v: string | null) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v); else next.delete(k);
      return next;
    }, { replace: true });
  };
  const ctx: Ctx = { r, g, slug, sport, label };
  const total = board ? filterBoard(board.rows, { pricedOnly }).length : 0;
  return (
    <section className="pb" aria-labelledby="pb-h" data-testid="props-board">
      <div className="gsec__h">
        <h2 id="pb-h" className="gsec__t">Player props</h2>
        <p className="gsec__sub">Every player prop of the game by family. Each card reads where the simulation's projection sits against the main line, then opens into the price after fees, the shadow model next to the market, the risks and the other lines. {scorecard}</p>
      </div>
      <div className="pb__filters">
        <div className="skchips" role="group" aria-label="Prop family">
          <Chip on={family === 'all'} onClick={() => set('family', null)}>All <small>{total}</small></Chip>
          {PROP_FAMILY_ORDER.filter((f) => board && filterBoard(board.rows, { family: f, pricedOnly }).length > 0).map((f) => (
            <Chip key={f} on={family === f} onClick={() => set('family', family === f ? null : f)}>{PROP_FAMILY_LABEL[f]} <small>{board ? filterBoard(board.rows, { family: f, pricedOnly }).length : 0}</small></Chip>
          ))}
        </div>
        <div className="skchips" role="group" aria-label="Team">
          <Chip on={team === 'both'} onClick={() => set('team', null)}>Both teams</Chip>
          <Chip on={team === g.away.abbr} onClick={() => set('team', team === g.away.abbr ? null : g.away.abbr)}><TeamMark sport={sport} abbr={g.away.abbr} size="sm" /> {g.away.abbr}</Chip>
          <Chip on={team === g.home.abbr} onClick={() => set('team', team === g.home.abbr ? null : g.home.abbr)}><TeamMark sport={sport} abbr={g.home.abbr} size="sm" /> {g.home.abbr}</Chip>
          <label className="pb__switch"><input type="checkbox" checked={pricedOnly} onChange={(e) => setPricedOnly(e.target.checked)} /> Priced lines only</label>
        </div>
      </div>
      {loading && !board && <p className="muted">Reading the game's markets…</p>}
      {board && rows.length === 0 && <p className="muted">No player prop matches this selection{pricedOnly ? ' with a two-sided line' : ''}.</p>}
      {rows.length > 0 && (
        <div className="pgrid pb__grid">
          {rows.slice(0, 48).map((row) => <PropRowCard key={row.id} row={row} ctx={ctx} hist={hist.get(`${nameKey(row.name)}|${row.team.abbr}`)} scorecard={scorecard} />)}
        </div>
      )}
      {rows.length > 48 && <p className="muted small">Showing the 48 most readable of {rows.length}; narrow by family or team for the rest.</p>}
      {board && board.sidelined.length > 0 && (
        <p className="pb__side muted small">Not shown (publication lists them out): {board.sidelined.map((s) => `${s.name} (${s.status.toLowerCase().replace(/_/g, ' ')})`).join(', ')}.</p>
      )}
    </section>
  );
}
