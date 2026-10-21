// The v4 research sheet: one published opportunity (src/opportunity/types.ts) explained. Concise by default (why, the
// price against the model's range, the strongest published risk); evidence, risks, prices and sources only on request.
// It reports what the publication states. It never says "bet", never ranks a side as the one to take, and a game that
// has started shows its pregame research as frozen, not as live advice.
import { useCallback, useState } from 'react';
import { Link } from '../routing';
import { Icon } from './Icon';
import { useSheet } from './sheet';
import { Crest, gameHref } from './base';
import { SaveControl } from './SaveControl';
import { sideExtra } from './saveSide';
import { signalsHref, standingOf } from './signalsModel';
import { useNow } from '../live/hooks';
import { quoteAgeMs, quoteFreshness } from '../live/freshness';
import { agoWord, authorityWord, calibrationWord } from './words';
import { betPhrase } from '../lib/betWords';
import type { Opportunity } from '../opportunity/types';
import type { GameRow } from '../views/broadcast/games';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** The contract in the words the publication's side means: a NO on "Bills win" reads "Bills not to win", never the bare title. */
export const contractWords = (o: Opportunity) => betPhrase(o.what.side, o.what.title).text;

/** Opens the research sheet for an opportunity (optionally with the game row it belongs to, for its crests and link). */
export function useResearch() {
  const sheet = useSheet();
  return useCallback((o: Opportunity, g?: GameRow, opts: { signalsLink?: boolean } = {}) => sheet.open(<ResearchSheet o={o} g={g ?? null} signalsLink={opts.signalsLink} />, { label: `Research: ${contractWords(o)}` }), [sheet]);
}

type Tab = 'evidence' | 'risks' | 'price' | 'source';

/**
 * The research sheet for one opportunity. It states where the opportunity stands NOW (current, watch, passed, or no longer
 * current and why) from the same rules the Signals feed and the prop sheet use, re-read on the sheet's own clock, so a sheet
 * left open never keeps calling a lapsed signal current. `signalsLink` adds the way to the Signals feed for the same game and contract.
 */
export function ResearchSheet({ o, g, signalsLink = true }: { o: Opportunity; g: GameRow | null; signalsLink?: boolean }) {
  const { close } = useSheet();
  const now = useNow(30_000);
  const phrase = betPhrase(o.what.side, o.what.title);
  const [detail, setDetail] = useState(false);
  const [tab, setTab] = useState<Tab>('evidence');
  const p = o.price;
  const frozen = o.phase !== 'PREGAME';
  const age = quoteAgeMs(p.observedAt, now);
  const fresh = quoteFreshness(p.observedAt, now);
  const quoteLine = p.ask == null ? 'No executable quote' : p.observedAt ? `${cents(p.ask)} ask · ${agoWord(age)}` : `${cents(p.ask)} ask · capture time not published`;
  const st = standingOf(o, now);
  const priceUsable = !frozen && p.state === 'CURRENT' && st.kind === 'current';
  const lo = p.fairLow ?? p.fair, hi = p.fairHigh ?? p.fair;
  const showGap = p.fair != null && p.ask != null;
  const pos = (v: number) => `${Math.max(2, Math.min(98, v * 100))}%`;
  const tabs: [Tab, string][] = [['evidence', 'Evidence'], ['risks', 'Risks'], ['price', 'Prices'], ['source', 'Source']];
  return (
    <>
      <div className="v4-shead">
        {g && <Crest sport={g.sport} p={g.home} />}
        <div className="v4-shead__t">
          <h2 data-autofocus tabIndex={-1}>{contractWords(o)}</h2>
          <p className="v4-shead__m">{o.eventLabel}{o.competition ? ` · ${o.competition}` : ''}</p>
          {phrase.rewritten && <p className="v4-shead__m">Publication's contract: {phrase.exact}</p>}
        </div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close research"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody">
        <span className={`v4-auth${frozen || st.kind !== 'current' ? ' v4-auth--frozen' : ''}`}>
          <Icon name={frozen ? 'lock-simple' : st.kind === 'current' ? 'shield-check' : 'info'} />
          {frozen ? 'Pregame research · frozen at kickoff'
            : st.kind === 'current' ? `Research · ${authorityWord(o.authority)}`
            : st.kind === 'watch' ? 'Watch · a published game-level watch, not a priced contract signal'
            : st.kind === 'passed' ? 'Passed by the publication'
            : 'No longer current'}
        </span>
        {st.why && <p className="v4-sstate" role="status">{st.why}</p>}

        <section className="v4-sblock"><h3>{st.kind === 'current' ? 'Why it is flagged' : 'What the publication said'}</h3><p>{o.why}</p></section>

        {showGap ? (
          <section className="v4-sblock" aria-label="Market price against the model's range">
            <h3>{priceUsable ? 'Price against the model' : 'Price as published'}</h3>
            <div className="v4-gap">
              <span className="v4-gap__lab" style={{ left: pos(p.ask!) }}>{cents(p.ask)}<small>Kalshi ask</small></span>
              <div className="v4-gap__track">
                <span className="v4-gap__band" style={{ left: pos(lo ?? p.fair!), width: `${Math.max(1.5, ((hi ?? p.fair!) - (lo ?? p.fair!)) * 100)}%` }} />
                <span className="v4-gap__tick" style={{ left: pos(p.ask!) }} />
                <span className="v4-gap__dot" style={{ left: pos(p.fair!) }} />
              </div>
              <span className="v4-gap__lab v4-gap__lab--bot" style={{ left: pos(p.fair!) }}>{pct(p.fair)}<small>Model fair{p.fairLow != null && p.fairHigh != null ? ` (${pct(p.fairLow)}–${pct(p.fairHigh)})` : ''}</small></span>
            </div>
            <div className="v4-gap__pad" />
            <div className="v4-stats">
              <div className="v4-stat"><b>{pct(p.breakEven)}</b><small>Break-even after fee</small></div>
              <div className="v4-stat"><b>{cents(p.fee)}</b><small>Kalshi fee{p.feeSource === 'kalshi-schedule' ? ' (schedule)' : ''}</small></div>
              <div className="v4-stat"><b>{p.evPerContract == null ? '—' : `${p.evPerContract >= 0 ? '+' : '−'}${Math.abs(Math.round(p.evPerContract * 100))}¢`}</b><small>Model value per $1{p.evSource === 'derived' ? ' (derived)' : ''}</small></div>
            </div>
            <p className="meta" style={{ marginTop: 12 }}>
              <span className={`v4-dot${fresh === 'STALE' || fresh === 'UNKNOWN' ? ' v4-dot--stale' : ''}`} style={{ display: 'inline-block', marginRight: 8 }} />
              {quoteLine}{fresh === 'STALE' ? ' · stale, re-check before relying on it' : ''}
            </p>
          </section>
        ) : (
          <section className="v4-sblock"><h3>Price</h3><p>{p.state === 'NO_QUOTE' ? 'No executable Kalshi quote is published for this side.' : p.state === 'UNPRICED' ? 'The publication does not price this contract.' : 'No price comparison is available.'}</p></section>
        )}

        {o.risk && (
          <div className="v4-skeptic"><Icon name="warning" size="s" /><span><b>The strongest published reason it loses. </b>{o.risk}</span></div>
        )}

        {!detail ? (
          <button type="button" className="v4-btn v4-btn--sec" style={{ marginTop: 18, width: '100%' }} onClick={() => setDetail(true)}>Show evidence, risks and sources</button>
        ) : (
          <>
            <div className="v4-stabs" role="tablist" aria-label="Research detail">
              {tabs.map(([k, label]) => <button key={k} type="button" role="tab" id={`v4rs-${k}`} aria-selected={tab === k} aria-controls="v4rs-panel" className="v4-stab" onClick={() => setTab(k)}>{label}</button>)}
            </div>
            <div role="tabpanel" id="v4rs-panel" aria-labelledby={`v4rs-${tab}`}>
              {tab === 'evidence' && (o.evidence.length
                ? <ul className="v4-sbullets v4-sblock">{o.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                : <p className="v4-sblock"><span style={{ color: 'var(--tx2)' }}>The publication lists no separate evidence statements for this signal.</span></p>)}
              {tab === 'risks' && (
                <div className="v4-sblock">
                  {o.risk ? <ul className="v4-sbullets v4-sbullets--risk"><li>{o.risk}</li></ul> : <p>No counter-case is published.</p>}
                  {o.confidence.record && <p style={{ marginTop: 10 }}>{o.confidence.record.line}</p>}
                  {o.alternatives.length > 0 && <><h3 style={{ marginTop: 16 }}>Related expressions the publication names</h3><ul className="v4-sbullets">{o.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
                </div>
              )}
              {tab === 'price' && (
                <div className="v4-sblock">
                  <div className="v4-kv"><span className="v4-kv__k">Side</span><span className="v4-kv__v">{p.side}{o.what.subject ? ` · ${o.what.subject}` : ''}</span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Ask</span><span className="v4-kv__v">{cents(p.ask)}<em>{p.observedAt ? `${agoWord(age)} · ${p.source === 'live' ? 'live quote' : 'as published'}` : 'capture time not published'}</em></span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Bid</span><span className="v4-kv__v">{cents(p.bid)}</span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Available at the ask</span><span className="v4-kv__v">{p.availableSize == null ? 'Not published' : `${p.availableSize} contracts`}</span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Publication's upper limit price</span><span className="v4-kv__v">{cents(p.betUpTo)}<em>Published by the research, never derived by Sift</em></span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Price state</span><span className="v4-kv__v">{p.state.replace(/_/g, ' ').toLowerCase()}</span></div>
                  {o.priceNote && <p className="meta" style={{ marginTop: 10 }}>{o.priceNote}</p>}
                </div>
              )}
              {tab === 'source' && (
                <div className="v4-sblock">
                  <div className="v4-kv"><span className="v4-kv__k">Authority</span><span className="v4-kv__v">{authorityWord(o.authority)}</span></div>
                  <div className="v4-kv"><span className="v4-kv__k">Calibration</span><span className="v4-kv__v">{calibrationWord(o.confidence.calibration)}<em>{o.confidence.note}</em></span></div>
                  {o.confidence.support && <div className="v4-kv"><span className="v4-kv__k">Support</span><span className="v4-kv__v">{o.confidence.support}{o.confidence.supportNote && <em>{o.confidence.supportNote}</em>}</span></div>}
                  {Object.entries(o.confidence.inputs).map(([k, v]) => <div className="v4-kv" key={k}><span className="v4-kv__k">{k}</span><span className="v4-kv__v">{v}</span></div>)}
                  {o.ticker && <div className="v4-kv"><span className="v4-kv__k">Kalshi contract</span><span className="v4-kv__v" style={{ wordBreak: 'break-all', fontWeight: 500, fontSize: 13 }}>{o.ticker}</span></div>}
                </div>
              )}
            </div>
          </>
        )}
        {signalsLink && <Link to={signalsHref({ sport: o.slug, game: o.eventId, market: o.marketId, side: o.what.side })} className="v4-textlink" onClick={close} style={{ marginTop: 10 }}>All signals on this game</Link>}
        <p className="meta" style={{ marginTop: 18 }}>Research only. Sift reports what the publication states; it does not recommend a bet.</p>
      </div>
      <div className="v4-sfoot">
        {o.marketId && (
          <SaveControl sport={o.sport} id={o.marketId} extra={sideExtra(o.marketId, o.eventId, o.what.side)} kickoff={o.startTime} variant="button"
            label={{ label: contractWords(o), sub: `${o.eventLabel}${o.competition ? ` · ${o.competition}` : ''}`, href: o.href, kickoff: o.startTime, side: o.what.side }} />
        )}
        {g ? <Link to={gameHref(g, 'markets')} className="v4-btn" onClick={close}>Open game markets</Link> : <button type="button" className="v4-btn" onClick={close}>Done</button>}
      </div>
    </>
  );
}
