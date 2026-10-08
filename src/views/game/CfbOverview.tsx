// The CFB game overview for a V2 game (claims_v2): a five-second Quick Read, then the best research, then every
// detail one tap down. Layer 1 is one sentence, the claim chips, the CONTROL side's own price and what the research
// signal currently means for it (Value Watch, Strong CONTROL, Market Disagreement, or no clear read). Layer 2 is the
// CONTROL tier's historical empirical range and the main matchup edges. Layer 3 keeps everything the page used to
// show — the V1 read and scripts, matchup evidence, the full V2 read, the markets that survive the scripts, data
// confidence and provenance — inside closed disclosures, nothing deleted.
//
// The words come from the research-signals contract when it is available; without it the page falls back to the
// game's own claims_v2 (headline and chips) and shows no Value Watch badge. Historical results are counts of past
// games ("566 of 628 past games"), never a percentage or a chance.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Market } from '../../contract/types';
import { useCfbSignals } from '../../data/cfbSignals';
import {
  claimsFromV2,
  contractPriceView,
  edgesFromClaims,
  isDisagreement,
  isPricedHigh,
  isValueWatch,
  marginRange,
  NO_PRICE,
  pastGamesText,
  priceText,
  STRENGTH_LABEL,
  viewOfAsk,
  type PriceView,
  type SignalGame,
} from '../../lib/cfbSignals';
import { ago } from '../../lib/format';
import { signedPoints, type Engine } from '../../lib/scriptEngine';
import { CfbGlyph, Chip, supportChips } from '../cfb/kit';
import { Info } from './panels';

export interface CfbOverviewProps {
  engine: Engine;
  eventId: string;
  /** The game's markets with live quotes overlaid (GameView's `quoted`). */
  markets: Market[];
  participants: { home: string; away: string };
  signalsUrl: string | null | undefined;
  now: number;
  marketsHref: string;
  /** The existing panels, shown inside the deep dive. */
  deep: { read: ReactNode; scripts: ReactNode; v2: ReactNode; survivors: ReactNode; edges: ReactNode; confidence: ReactNode };
}

/** The game-winner contract of one participant (CFB lists these as market_family 'game_moneyline', one per team). */
function winnerMarket(markets: Market[], pid: string | null, ticker: string | null | undefined): Market | undefined {
  const family = (m: Market) => m.market_family === 'game_moneyline' || m.market_family === 'game_winner';
  return (pid ? markets.find((m) => family(m) && m.participant_id === pid) : undefined) ?? (ticker ? markets.find((m) => m.kalshi_ticker === ticker) : undefined);
}

function marketView(m: Market | undefined): PriceView {
  return m ? viewOfAsk(m.yes_ask, m.captured_at ?? null, 'publication') : NO_PRICE;
}

function Deep({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <details className="cfdd__s" data-deep={id}>
      <summary className="cfdd__h"><span>{title}</span><span className="cfdd__chev" aria-hidden="true" /></summary>
      <div className="cfdd__b">{children}</div>
    </details>
  );
}

export function CfbOverview({ engine, eventId, markets, participants, signalsUrl, now, marketsHref, deep }: CfbOverviewProps) {
  const v2 = engine.claimsV2!;
  const { doc } = useCfbSignals(signalsUrl);
  const sg: SignalGame | null = doc?.byEvent.get(eventId) ?? null;
  const claims = claimsFromV2(engine);
  const control = claims?.control ?? null;
  const noClaim = v2.status === 'NO_SUPPORTED_CLAIM';
  const pid = control ? participants[control.side] : null;

  // The CONTROL side's own price: the live-overlaid game market first, the contract's capture when the game has none.
  let price: PriceView = NO_PRICE;
  if (control) {
    price = marketView(winnerMarket(markets, pid, sg?.market?.is_control_side ? sg.market.price?.market_ticker : null));
    if (price.kind === 'UNAVAILABLE' && sg?.market?.is_control_side) price = contractPriceView(sg.market.price);
  }
  // A game the signals document describes is judged by its rule; the claims stay the game's own.
  const judged: SignalGame | null = sg ? { ...sg, claims: sg.claims ?? claims } : null;
  const valueWatch = isValueWatch(judged, doc);
  const disagreement = isDisagreement(judged, doc, price);
  const pricedHigh = isPricedHigh(judged, doc, price);
  const s = doc?.signals ?? null;

  const read = sg?.read ?? v2.story.headline;
  const chips = supportChips(claims, { disruption: true });
  const edges = (sg?.edges.length ? sg.edges : edgesFromClaims(claims)).slice(0, 4);
  const range = engine.claimsV2?.claims.control?.historical_range ?? null;
  const hist = range
    ? { median: range.median, c50: range.central_50, c80: range.central_80, wins: range.win_rate.hits, n: range.win_rate.n, not: range.not }
    : sg?.historical
      ? { median: sg.historical.median, c50: sg.historical.central_50, c80: sg.historical.central_80, wins: sg.historical.wins, n: sg.historical.n, not: sg.historical.not ?? '' }
      : null;

  // Without a CONTROL side the market context is each team's own game-winner ask, side by side (never 1 − the other).
  const sides = !control
    ? (['away', 'home'] as const)
        .map((side) => ({ side, team: engine.teams[side]?.name ?? side, view: marketView(winnerMarket(markets, participants[side], null)) }))
        .filter((x) => x.view.kind !== 'UNAVAILABLE')
    : [];

  const statements = [
    ...v2.story.clauses.map((c) => c.text),
    ...[v2.claims.control?.statement, v2.claims.closeness?.statement, v2.claims.pace?.statement, v2.claims.scoring_environment?.statement, v2.claims.defensive_suppression?.statement, ...v2.claims.disruption.map((d) => d.statement)].filter((x): x is string => !!x),
  ];

  return (
    <div className="cfov">
      <section className={`cfq${valueWatch ? ' cfq--vw' : ''}${disagreement ? ' cfq--dis' : ''}`} aria-labelledby="cfq-h" data-testid="cfb-quick-read">
        <h2 className="cfq__eye" id="cfq-h">SIFT Read</h2>
        <p className="cfq__read">{read}</p>

        {!noClaim && (control || chips.length > 0 || valueWatch) && (
          <div className="cfq__chips" role="list" aria-label="SIFT read claims">
            {valueWatch && <span role="listitem"><Chip glyph="star" tone="star" strong>{s!.moderate_control.label}</Chip></span>}
            {control && <span role="listitem"><Chip glyph="control" tone="control" strong>{control.team} · {STRENGTH_LABEL[control.strength]}</Chip></span>}
            {chips.map((c) => <span role="listitem" key={c.key}><Chip glyph={c.glyph} tone={c.tone}>{c.text}</Chip></span>)}
          </div>
        )}

        {control && (
          <div className="cfq__mkt">
            <span className="cfq__k">Current market</span>
            <span className={`cfpx cfpx--${price.kind.toLowerCase()} cfpx--lg`}>{priceText(control.team, price)}</span>
            {price.observedAt && price.kind !== 'UNAVAILABLE' && <span className="cfq__age" title={price.observedAt}>{price.source === 'live' ? 'live quote' : 'captured'} {ago(price.observedAt, now)}</span>}
          </div>
        )}
        {!control && sides.length > 0 && (
          <div className="cfq__mkt">
            <span className="cfq__k">Current market</span>
            {sides.map((x) => <span key={x.side} className={`cfpx cfpx--${x.view.kind.toLowerCase()}`}>{priceText(x.team, x.view)}</span>)}
          </div>
        )}

        {valueWatch && s && (
          <div className="cfsig cfsig--star">
            <p className="cfsig__t"><CfbGlyph name="star" tone="star" size={16} /><b>{s.moderate_control.label}</b><span className="cfsig__d"> — {s.moderate_control.short}</span></p>
            <dl className="cfsig__facts">
              <div><dt>Research status</dt><dd>{s.moderate_control.status_line}</dd></div>
              <div><dt>Small sample</dt><dd>{s.moderate_control.small_sample}</dd></div>
            </dl>
            <details className="cfsig__why">
              <summary>What {s.moderate_control.label} means</summary>
              <p>{s.moderate_control.game_page_explanation}</p>
              {s.moderate_control.disclaimer && <p className="small muted">{s.moderate_control.disclaimer}</p>}
            </details>
          </div>
        )}
        {control?.strength === 'MODERATE' && !valueWatch && (
          <div className="cfsig"><p className="cfsig__t"><CfbGlyph name="control" tone="control" size={16} /><b>Moderate Control</b></p></div>
        )}
        {control?.strength === 'STRONG' && (
          <div className={`cfsig${disagreement ? ' cfsig--alert' : ''}`}>
            <p className="cfsig__t"><CfbGlyph name="control" tone="control" size={16} /><b>{s?.strong_control.label ?? 'Strong Control'}</b>{s && <span className="cfsig__d"> — {s.strong_control.short}</span>}</p>
            {pricedHigh && s && <p className="cfsig__n">{s.strong_control.priced_high}</p>}
            {disagreement && s && (
              <>
                <p className="cfsig__t cfsig__t--alert"><CfbGlyph name="alert" tone="alert" size={16} /><b>{s.market_disagreement.label}</b><span className="cfsig__d"> — {s.market_disagreement.short}</span></p>
                <details className="cfsig__why">
                  <summary>Why this is flagged</summary>
                  <p>{s.market_disagreement.explanation}</p>
                </details>
              </>
            )}
          </div>
        )}
        {noClaim && (
          <div className="cfsig cfsig--none">
            <p className="cfsig__t"><CfbGlyph name="none" tone="none" size={16} /><b>{s?.no_claim.label ?? 'No clear SIFT read'}</b></p>
            <p className="cfsig__n">{s?.no_claim.short ?? 'No supported matchup claim cleared the evidence requirements.'}</p>
            <details className="cfsig__why">
              <summary>What this means</summary>
              <p>{s?.no_claim.explanation ?? 'This does not mean the game is unusually unpredictable. The current evidence taxonomy did not justify a stronger claim.'}</p>
            </details>
          </div>
        )}
      </section>

      {(control && hist) || edges.length > 0 ? (
        <section className="cfbest" aria-labelledby="cfbest-h">
          <h2 className="cfq__eye" id="cfbest-h">Best Research</h2>
          {control && hist && (
            <div className="cfrange" role="group" aria-label="Historical empirical range">
              <p className="cfrange__h">
                Historical empirical range
                {hist.not && <Info label="What the historical range is">{hist.not} Margins of past games that carried the same football claim, from {control.team}'s side.</Info>}
              </p>
              <dl className="cfrange__dl">
                <div><dt>Team</dt><dd>{control.team}</dd></div>
                <div><dt>Control strength</dt><dd>{control.strength === 'STRONG' ? 'Strong' : 'Moderate'}</dd></div>
                <div><dt>Median</dt><dd>{signedPoints(hist.median)}</dd></div>
                <div><dt>Middle 50%</dt><dd>{marginRange(hist.c50)}</dd></div>
                <div><dt>Middle 80%</dt><dd>{marginRange(hist.c80)}</dd></div>
                <div><dt>Historical wins</dt><dd>{pastGamesText(hist)}</dd></div>
              </dl>
            </div>
          )}
          {edges.length > 0 && (
            <div className="cfedges">
              <p className="cfrange__h">Main matchup edges</p>
              <ul className="cfedges__l">
                {edges.map((e) => <li key={e}><CfbGlyph name="check" tone="check" size={15} />{e}</li>)}
              </ul>
            </div>
          )}
        </section>
      ) : null}

      <section className="cfdd" aria-labelledby="cfdd-h">
        <h2 className="cfq__eye" id="cfdd-h">Deep Dive</h2>
        <Deep id="why" title="Why this read?">
          <ul className="why__list small cfdd__why">{statements.map((t) => <li key={t}>{t}</li>)}</ul>
        </Deep>
        <Deep id="evidence" title="Matchup evidence">{deep.edges}</Deep>
        <Deep id="scripts" title="All claims & scripts">
          <div className="cfdd__stack">{deep.read}{deep.scripts}</div>
        </Deep>
        <Deep id="historical" title="Historical details">{deep.v2}</Deep>
        <Deep id="markets" title="Markets">
          {deep.survivors}
          <p className="small"><Link to={marketsHref}>Every contract on this game →</Link></p>
        </Deep>
        <Deep id="methodology" title="Methodology & provenance">
          {deep.confidence}
          <dl className="cfprov small">
            <div><dt>Methodology</dt><dd>{v2.methodology_version} · {v2.activation === 'SHADOW' ? 'V2 preview beside the active V1 scripts' : v2.activation}</dd></div>
            <div><dt>Claims hash</dt><dd>{v2.claims_artifact_hash.slice(0, 16)}</dd></div>
            {doc?.protocol?.sha256 && <div><dt>Signals protocol</dt><dd>{doc.protocol.sha256.slice(0, 16)}</dd></div>}
            {doc?.study?.pr && <div><dt>Market study</dt><dd>{doc.study.pr}</dd></div>}
            {doc && <div><dt>Signals published</dt><dd>{doc.generated_at} · {doc.methodology_version}</dd></div>}
            <div><dt>Status</dt><dd><span className="rchip">Research only</span> Football claims and market context, never a recommendation.</dd></div>
          </dl>
        </Deep>
      </section>
    </div>
  );
}
