// The "Markets this script settles" cards of the CFB Scripts tab: for the selected script, each supported contract
// with WHAT (side, price after fee), WHY (the script and the football conditions it requires), RISK (the scripts it
// loses in), and ALTERNATIVES (the other rungs of its thesis). Counts stay counts; nothing here is a probability.
import { Link } from 'react-router';
import type { Market } from '../../contract/types';
import { routes } from '../../lib/routes';
import { LABEL_WORD, orderedLabels, type Engine } from '../../lib/scriptEngine';
import { relationWord, scriptMarketCards, type ScriptMarketCard } from '../../lib/scriptMarkets';
import { quoteAgeMs, formatQuoteAge } from '../../live/freshness';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function Card({ c, slug, eventId, now }: { c: ScriptMarketCard; slug: string; eventId: string; now: number }) {
  const m = c.market;
  const ageMs = m?.captured_at ? quoteAgeMs(m.captured_at, now) : null;
  const age = ageMs != null ? formatQuoteAge(ageMs) : null;
  const labels = orderedLabels(c.labels).filter((l) => l !== 'CONTRADICTED').slice(0, 3);
  return (
    <article className={`smc${c.researchOnly ? ' smc--research' : ''}`} data-testid="script-market">
      <header className="smc__h">
        <h4 className="smc__t">{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{c.label}</Link> : c.label}</h4>
        <span className={`smc__fit smc__fit--${c.compat.toLowerCase()}`}>{c.compat === 'SUPPORTED' ? 'Pays across this script' : `Pays in ${pct(c.coverage)} of its range`}</span>
      </header>
      {labels.length > 0 && <p className="smc__labels">{labels.map((l) => <span key={l} className="skpill skpill--neutral">{LABEL_WORD[l] ?? l.toLowerCase().replace(/_/g, ' ')}</span>)}</p>}
      <dl className="smc__nums">
        <div><dt>{c.e.side} ask</dt><dd className="num">{cents(c.ask)}</dd></div>
        <div><dt>Break-even</dt><dd className="num">{pct(c.breakEven)}</dd></div>
        <div><dt>Script survival</dt><dd>{c.survival}</dd></div>
      </dl>
      {c.paysWhen && <p className="smc__line"><b>Pays when</b> {c.paysWhen}.</p>}
      {c.conditions.length > 0 && (
        <details className="smc__d">
          <summary>Football it needs</summary>
          <ul>{c.conditions.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
      {c.losesIn.length > 0 ? (
        <p className="smc__risk"><b>Loses in</b> {c.losesIn.map((x) => `the ${x.role.toLowerCase()} script (${x.title})`).join(' and ')}.</p>
      ) : (
        <p className="smc__line muted">No script the engine built contradicts this side{c.silentIn.length ? `; ${c.silentIn.length} make${c.silentIn.length === 1 ? 's' : ''} no settlement claim about it` : ''}.</p>
      )}
      {c.researchOnly && <p className="smc__line muted">Research only: the engine does not calibrate scoring bands, so this total's script fit is descriptive.</p>}
      {c.alternatives.length > 0 && (
        <details className="smc__d">
          <summary>Other rungs of the same thesis ({c.alternatives.length})</summary>
          <ul className="smc__alts">
            {c.alternatives.map((a) => (
              <li key={a.e.id}>
                <span>{a.market ? <Link to={routes.market(slug, a.market.market_id, eventId)}>{a.label}</Link> : a.label}</span>
                <span className="muted">{relationWord(a.relation)}{a.extraPoints != null ? ` · ${a.extraPoints > 0 ? '+' : ''}${a.extraPoints} pts` : ''}</span>
                <span className="num">{cents(a.ask)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="smc__foot muted">{age ? `Price ${ageMs != null && ageMs < 15 * 60_000 ? 'current' : 'captured'} ${age}. ` : 'No executable quote. '}Break-even is the ask plus Kalshi's taker fee. The price ranks ways to express the same football view; it never created the view.</p>
    </article>
  );
}

export function ScriptMarkets({ engine, selected, marketsByTicker, slug, eventId, now }: { engine: Engine; selected: string | null; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number }) {
  const cards = scriptMarketCards(engine, selected, marketsByTicker);
  if (!cards.length) return <p className="muted small">No contract is supported by this script.</p>;
  return <div className="smc__grid">{cards.map((c) => <Card key={c.e.id} c={c} slug={slug} eventId={eventId} now={now} />)}</div>;
}
