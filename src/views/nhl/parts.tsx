// NHL research surfaces: script rows and cards, the cross-script matrix, research candidates, basis-labelled
// findings, goaltending and lines. Everything renders the NHL publication's structured research as published
// (lib/nhl.ts); Sift adds wording, never a probability. No decorative probability bars: script likelihoods are
// written numbers beside each script's name.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { EventResearchDoc, Market } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { DigDeeper, TeamMark } from '../../components/ui';
import { describeNhlMarket } from '../../lib/marketLabel';
import { routes } from '../../lib/routes';
import {
  BASIS_HELP,
  BASIS_WORD,
  STAGE_WORD,
  STATUS_HELP,
  STATUS_WORD,
  TIER_HELP,
  TIER_WORD,
  candidateTitle,
  centsText,
  dependencyShort,
  evAt,
  evText,
  learningLine,
  liveAskCents,
  priceCheck,
  probText,
  sideLabel,
  survivalText,
  type Basis,
  type Learning,
  type NhlCandidate,
  type NhlFinding,
  type NhlMarketRow,
  type NhlScript,
  type NhlScripts,
  type Tier,
} from '../../lib/nhl';
import { formatQuoteAge, quoteAgeMs, quoteFreshness } from '../../live/freshness';
import type { Finding } from '../../research/findings';
import { Info, PanelHead, ViewAll } from '../game/panels';
import '../../styles/nhl.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ chips

export function TierChip({ tier }: { tier: Tier }) {
  return <span className={`ntier ntier--${tier.toLowerCase()}`} title={TIER_HELP[tier]}>{TIER_WORD[tier]}</span>;
}

export function BasisChip({ basis }: { basis: Basis }) {
  return <span className={`nbasis nbasis--${basis.toLowerCase()}`} title={BASIS_HELP[basis]}>{BASIS_WORD[basis]}</span>;
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`nstatus nstatus--${status.toLowerCase()}`} title={STATUS_HELP[status]}>{STATUS_WORD[status] ?? status}</span>;
}

export function ResearchOnly() {
  return <span className="rchip" title="Research only: Sift places no bets and holds no betting credentials.">Research only</span>;
}

export function ScriptDot({ tone }: { tone: number }) {
  return <i className={`sdot ndot--s${tone}`} aria-hidden="true" />;
}

/** "NHL MODEL · LEARNING" with the real sample behind it. */
export function LearningBadge({ learning, slug, compact }: { learning: Learning | null; slug: string; compact?: boolean }) {
  const stage = learning?.stage?.stage;
  const word = stage ? STAGE_WORD[stage] ?? stage : 'Learning';
  const failed = learning?.status === 'STALE_LAST_RUN_FAILED';
  const line = learningLine(learning);
  return (
    <span className={`nlearn${compact ? ' nlearn--compact' : ''}${failed ? ' nlearn--warn' : ''}`}>
      <Link to={routes.scorecard(slug)} className="nlearn__chip" aria-label={`NHL model status: ${word}. Open the NHL scorecard.`}>
        <span className="nlearn__k">NHL model</span><span className="nlearn__v">{word}</span>
      </Link>
      {!compact && line && <span className="nlearn__line">{line}</span>}
      {!compact && failed && <span className="nlearn__line nlearn__line--warn">The last evaluation step failed; numbers are from the previous run.</span>}
      {!compact && !learning && <span className="nlearn__line">No learning scorecard in this publication yet.</span>}
    </span>
  );
}

// ------------------------------------------------------------------ prices

/** The side's ask in cents: the live quote when Sift has one, otherwise the research run's price (labelled). */
export function SideAsk({ c, m, now }: { c: { side: 'yes' | 'no'; price: { ask_cents: number | null } }; m: Market | undefined; now: number }) {
  const live = liveAskCents(m, c.side);
  const fresh = quoteFreshness(m?.captured_at ?? null, now);
  const age = quoteAgeMs(m?.captured_at ?? null, now);
  const v = live ?? c.price.ask_cents;
  const cls = v == null ? 'price--none' : fresh === 'STALE' || fresh === 'UNKNOWN' ? 'price--stale' : fresh === 'AGING' ? 'price--aging' : '';
  return (
    <span className={`price ${cls}`} data-quote-state={fresh} title={`${sideLabel(c.side)} ask ${centsText(v)} · updated ${formatQuoteAge(age)} ago (${fresh})`}>
      {centsText(v)}
    </span>
  );
}

// ------------------------------------------------------------------ scripts

function scoreLine(s: NhlScript, homeAbbr: string, awayAbbr: string): string {
  const bits: string[] = [];
  if (s.homeGoals != null && s.awayGoals != null) bits.push(`${awayAbbr} ${s.awayGoals.toFixed(1)} – ${homeAbbr} ${s.homeGoals.toFixed(1)} goals`);
  if (s.totalRange) bits.push(`total ${s.totalRange.p10}–${s.totalRange.p90}`);
  if (s.pOvertime != null && s.pOvertime >= 0.1) bits.push(`OT ${probText(s.pOvertime)}`);
  return bits.join(' · ');
}

function winnerLine(s: NhlScript, homeAbbr: string, awayAbbr: string): string | null {
  if (s.pHomeWin == null) return null;
  if (s.pHomeWin >= 0.999) return `${homeAbbr} wins every simulated game in this script`;
  if (s.pHomeWin <= 0.001) return `${awayAbbr} wins every simulated game in this script`;
  const fav = s.pHomeWin >= 0.5 ? homeAbbr : awayAbbr;
  return `${fav} wins ${probText(Math.max(s.pHomeWin, 1 - s.pHomeWin))} of games in this script`;
}

export function scriptFinding(s: NhlScript, r: EventResearchDoc, slug: string, label: string): Finding {
  return {
    key: `nhl-script:${s.id}`, kind: 'script', sport: 'NHL', title: `${label}: ${s.label} (${probText(s.probability)})`,
    statement: `${s.summary} NHL_SCRIPT_V1, ${probText(s.probability)} of simulated games; ${s.totalRange ? `total ${s.totalRange.p10}–${s.totalRange.p90} goals` : ''}.`,
    href: routes.game(slug, r.event.event_id, { tab: 'script', script: s.id }), anchor: { ref_kind: 'EVENT', id: r.event.event_id },
    kickoff: r.event.start_time_utc, eventStatus: r.event.status,
  };
}

/** "How It Could Play Out": every script, most likely first, written — no probability bar. */
export function ScriptRows({ s, homeAbbr, awayAbbr, hrefFor, selected, limit }: { s: NhlScripts; homeAbbr: string; awayAbbr: string; hrefFor: (id: string | null) => string; selected?: string | null; limit?: number }) {
  const rows = s.scripts.slice(0, limit ?? s.scripts.length);
  return (
    <ol className="nsrows">
      {rows.map((x) => {
        const on = selected === x.id;
        return (
          <li key={x.id}>
            <Link to={hrefFor(on ? null : x.id)} className={`nsrow nsrow--s${x.tone}${on ? ' is-sel' : ''}`} aria-current={on ? 'true' : undefined}>
              <span className="nsrow__h"><ScriptDot tone={x.tone} /><span className="nsrow__name">{x.label}</span><b className="nsrow__p num">{probText(x.probability)}</b></span>
              <span className="nsrow__d">{x.summary}</span>
              <span className="nsrow__m">{scoreLine(x, homeAbbr, awayAbbr)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function ScriptsSummaryPanel({ s, homeAbbr, awayAbbr, hrefFor, to }: { s: NhlScripts; homeAbbr: string; awayAbbr: string; hrefFor: (id: string | null) => string; to: string }) {
  const covered = s.scripts.reduce((a, x) => a + x.probability, 0);
  return (
    <section className="panel nscripts" aria-labelledby="n-scripts-h">
      <div className="phead">
        <h2 className="phead__t" id="n-scripts-h">
          How It Could Play Out
          <Info label="How NHL scripts are built">
            Seven hockey game scripts from {s.nDraws.toLocaleString('en-US')} simulated games of the NHL model's joint draw. Each simulated game is assigned
            exactly one script by fixed rules (special teams first, then open, tight low-event, goalie-driven, control, and back-and-forth as the
            catch-all), so the percentages are shares of simulated games and add to {probText(covered)}. No narrative is generated at runtime.
          </Info>
        </h2>
        <ViewAll to={to}>Every script</ViewAll>
      </div>
      <ScriptRows s={s} homeAbbr={homeAbbr} awayAbbr={awayAbbr} hrefFor={hrefFor} limit={4} />
      <p className="muted small nscripts__foot">{s.scripts.length - Math.min(4, s.scripts.length)} more scripts on the Scripts tab · {s.versions.script}</p>
    </section>
  );
}

/** One script in full: why it exists, what would need to happen, what breaks it, its numbers and its markets. */
export function ScriptDetail({ x, s, homeAbbr, awayAbbr, slug, eventId, marketsByTicker, r }: { x: NhlScript; s: NhlScripts; homeAbbr: string; awayAbbr: string; slug: string; eventId: string; marketsByTicker: Map<string, Market>; r: EventResearchDoc }) {
  const idx = s.order.indexOf(x.id);
  const surv = s.candidates.filter((c) => c.survival.survives?.[idx]);
  const fail = s.candidates.filter((c) => c.survival.survives && !c.survival.survives[idx]);
  const wl = winnerLine(x, homeAbbr, awayAbbr);
  return (
    <article className={`nsd nsd--s${x.tone}`} id={`script-${x.id}`} aria-labelledby={`script-${x.id}-h`}>
      <header className="nsd__h">
        <h3 id={`script-${x.id}-h`} className="nsd__t"><ScriptDot tone={x.tone} />{x.label}</h3>
        <span className="nsd__p num">{probText(x.probability)}</span>
        <DigDeeper finding={scriptFinding(x, r, slug, `${awayAbbr} at ${homeAbbr}`)} compact />
      </header>
      <p className="nsd__sum">{x.summary}</p>
      <dl className="nsd__kv">
        <div><dt>Needs</dt><dd>{x.needs}</dd></div>
        <div><dt>Breaks it</dt><dd>{x.breaks}</dd></div>
        <div><dt>Rule</dt><dd className="muted">{x.rule}{x.leagueBaseRate != null && <> · {probText(x.leagueBaseRate)} of NHL games 2022–26</>}</dd></div>
      </dl>
      <ul className="nsd__nums">
        {x.homeGoals != null && <li><span>Goals</span><b className="num">{awayAbbr} {x.awayGoals?.toFixed(1)} – {homeAbbr} {x.homeGoals.toFixed(1)}</b></li>}
        {x.totalRange && <li><span>Total goals</span><b className="num">{x.totalRange.p10}–{x.totalRange.p90}</b><small>median {x.totalRange.p50}</small></li>}
        {x.homeShots != null && <li><span>Shots</span><b className="num">{awayAbbr} {x.awayShots?.toFixed(0)} – {homeAbbr} {x.homeShots.toFixed(0)}</b></li>}
        {x.homeSaves != null && <li><span>Starter saves</span><b className="num">{awayAbbr} {x.awaySaves?.toFixed(0)} · {homeAbbr} {x.homeSaves.toFixed(0)}</b></li>}
        {x.ppShare != null && <li><span>Power-play goals</span><b className="num">{probText(x.ppShare)}</b><small>of goals</small></li>}
        {x.pOvertime != null && <li><span>Overtime</span><b className="num">{probText(x.pOvertime)}</b></li>}
      </ul>
      {wl && <p className="small nsd__win">{wl}.</p>}
      {x.players.length > 0 && <p className="small"><b>Most involved:</b> {x.players.map((p) => `${p.player} (point ${probText(p.p_point)})`).join(' · ')}</p>}
      <div className="nsd__mk">
        <div>
          <h4 className="nsd__h4">Markets it helps</h4>
          {x.helps.length ? (
            <ul className="nsd__list">{x.helps.map((h) => {
              const hm = marketsByTicker.get(h.ticker);
              const t = (hm ? describeNhlMarket(hm)?.title : null) ?? h.title;
              return <li key={h.ticker + h.side}>{hm ? <Link to={routes.market(slug, hm.market_id, eventId)}>{t}</Link> : t} {h.side === 'no' ? 'NO' : ''} <span className="muted num">{probText(h.p)} → {probText(h.p_given_script)}</span></li>;
            })}</ul>
          ) : <p className="muted small">No game market moves 5+ points in this script.</p>}
        </div>
        <div>
          <h4 className="nsd__h4">Research candidates</h4>
          {surv.length + fail.length ? (
            <ul className="nsd__list">
              {surv.slice(0, 4).map((c) => <li key={c.bet_id}><span className="nfit nfit--yes" aria-hidden="true" /> <CandLink c={c} m={marketsByTicker.get(c.ticker)} slug={slug} eventId={eventId} /> <span className="muted">survives</span></li>)}
              {fail.slice(0, 4).map((c) => <li key={c.bet_id}><span className="nfit nfit--no" aria-hidden="true" /> <CandLink c={c} m={marketsByTicker.get(c.ticker)} slug={slug} eventId={eventId} /> <span className="muted">fails</span></li>)}
            </ul>
          ) : <p className="muted small">No research candidate for this game.</p>}
        </div>
      </div>
    </article>
  );
}

function CandLink({ c, m, slug, eventId }: { c: NhlCandidate; m: Market | undefined; slug: string; eventId: string }) {
  const t = candidateTitle(c, m);
  return m ? <Link to={routes.market(slug, m.market_id, eventId)}>{t}</Link> : <span>{t}</span>;
}

// ------------------------------------------------------------------ cross-script matrix

interface MatrixRow { key: string; label: string; side: 'yes' | 'no'; row: NhlMarketRow; market?: Market; ev: (number | null)[]; mass: number | null; tier: Tier | null; candidate?: NhlCandidate }

function featuredGameRows(s: NhlScripts, markets: Market[]): MatrixRow[] {
  const out: MatrixRow[] = [];
  const pick = (fam: string, pred: (m: Market, r: NhlMarketRow) => boolean) => {
    const cands = markets.filter((m) => m.market_family === fam).map((m) => ({ m, r: s.markets.get(m.kalshi_ticker) })).filter((x): x is { m: Market; r: NhlMarketRow } => !!x.r && pred(x.m, x.r));
    return cands;
  };
  for (const { m, r } of pick('game_winner', () => true)) {
    out.push({ key: `${m.kalshi_ticker}|yes`, label: `${m.yes_description.replace(/ wins$/, '')} to win`, side: 'yes', row: r, market: m, ev: evAt(r, 'yes', r.yes?.cost ?? null), mass: r.yes?.mass ?? null, tier: r.yes?.tier ?? null });
  }
  const tot = pick('game_total', (_, r) => r.pYes != null).sort((a, b) => Math.abs((a.r.pYes ?? 0) - 0.5) - Math.abs((b.r.pYes ?? 0) - 0.5))[0];
  if (tot) {
    const line = tot.m.line ?? tot.m.threshold;
    for (const side of ['yes', 'no'] as const) {
      const sd = side === 'yes' ? tot.r.yes : tot.r.no;
      out.push({ key: `${tot.m.kalshi_ticker}|${side}`, label: `${side === 'yes' ? 'Over' : 'Under'} ${line} goals`, side, row: tot.r, market: tot.m, ev: evAt(tot.r, side, sd?.cost ?? null), mass: sd?.mass ?? null, tier: sd?.tier ?? null });
    }
  }
  for (const { m, r } of pick('game_spread', (m) => Number(m.line ?? m.threshold) === 1.5)) {
    out.push({ key: `${m.kalshi_ticker}|yes`, label: `${m.yes_description.replace(/ wins by over 1\.5 goals?/, '')} −1.5`, side: 'yes', row: r, market: m, ev: evAt(r, 'yes', r.yes?.cost ?? null), mass: r.yes?.mass ?? null, tier: r.yes?.tier ?? null });
  }
  return out;
}

function evCell(v: number | null, survives: boolean | undefined) {
  if (v == null) return <td className="nmx__c nmx__c--na">—</td>;
  return <td className={`nmx__c ${survives ? 'nmx__c--yes' : 'nmx__c--no'}`}><span className="num">{evText(v)}</span></td>;
}

/** Every candidate and the headline game markets against every script: EV per contract at the research run's ask. */
export function ScriptMatrix({ s, markets, marketsByTicker, slug, eventId, selected }: { s: NhlScripts; markets: Market[]; marketsByTicker: Map<string, Market>; slug: string; eventId: string; selected?: string | null }) {
  const rows: MatrixRow[] = useMemo(() => {
    const cand = s.candidates.filter((c) => c.governance.status !== 'REJECTED').map((c) => {
      const row = s.markets.get(c.ticker);
      return row ? { key: c.bet_id, label: candidateTitle(c, marketsByTicker.get(c.ticker)), side: c.side, row, market: marketsByTicker.get(c.ticker), ev: c.survival.ev_by_script ?? evAt(row, c.side, c.survival.cost), mass: c.survival.mass_survived, tier: c.robustness, candidate: c } as MatrixRow : null;
    }).filter((x): x is MatrixRow => !!x);
    const seen = new Set(cand.map((x) => x.key));
    return [...cand, ...featuredGameRows(s, markets).filter((x) => !seen.has(x.key))];
  }, [s, markets, marketsByTicker]);
  const cols = s.scripts; // most likely first
  const idx = (id: string) => s.order.indexOf(id);
  const survivesAt = (r: MatrixRow, id: string) => {
    const sd = r.side === 'yes' ? r.row.yes : r.row.no;
    return r.candidate?.survival.survives?.[idx(id)] ?? sd?.survives?.[idx(id)];
  };
  const mlink = (r: MatrixRow) => (r.market ? <Link to={routes.market(slug, r.market.market_id, eventId)} className="nmx__m">{r.label}</Link> : <span className="nmx__m">{r.label}</span>);
  return (
    <div className="nmx">
      <p className="nmx__key small">
        Expected value per $1 contract inside each script, at the research run's executable ask after Kalshi fees and the conservative haircut.
        <span className="nfit nfit--yes" aria-hidden="true" /> survives (≥ +1¢) · <span className="nfit nfit--no" aria-hidden="true" /> fails.
        <b> Survival</b> is the share of simulated games in the scripts a bet survives.
      </p>
      <div className="nmx__wide tscroll" tabIndex={0} role="region" aria-label="Script survival matrix">
        <table className="nmx__t">
          <thead>
            <tr>
              <th scope="col">Market</th>
              {cols.map((c) => <th key={c.id} scope="col" className={`nmx__h${selected === c.id ? ' is-sel' : ''}`}><ScriptDot tone={c.tone} /><span>{c.short}</span><small className="num">{probText(c.probability)}</small></th>)}
              <th scope="col" className="r">Survival</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{mlink(r)}{r.candidate ? <span className="nmx__tag">candidate</span> : <span className="nmx__tag nmx__tag--q">game market</span>}</th>
                {cols.map((c) => <Fragment key={c.id}>{evCell(r.ev[idx(c.id)] ?? null, survivesAt(r, c.id))}</Fragment>)}
                <td className="r num nmx__mass">{r.mass != null ? probText(r.mass) : '—'}{r.tier && <TierChip tier={r.tier} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="nmx__cards">
        {rows.map((r) => (
          <li key={r.key}>
            <details className="layer nmx__card">
              <summary className="layer__s">
                <span className="nmx__cm">{r.label}</span>
                <span className="nmx__cs">{r.mass != null ? `Survives ${probText(r.mass)}` : 'Not priced'}{r.tier && <> · <TierChip tier={r.tier} /></>}</span>
              </summary>
              <div className="layer__b">
                <ul className="nmx__cl">
                  {cols.map((c) => {
                    const v = r.ev[idx(c.id)] ?? null;
                    const ok = survivesAt(r, c.id);
                    return (
                      <li key={c.id}>
                        <span><ScriptDot tone={c.tone} />{c.label} <small className="muted num">{probText(c.probability)}</small></span>
                        <b className={`num ${v == null ? '' : ok ? 'nmx__v--yes' : 'nmx__v--no'}`}>{evText(v)}{v != null && <span className="sr-only">{ok ? ' survives' : ' fails'}</span>}</b>
                      </li>
                    );
                  })}
                </ul>
                {r.market && <Link to={routes.market(slug, r.market.market_id, eventId)} className="small">Open this market →</Link>}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ research candidates

function candidateFinding(c: NhlCandidate, r: EventResearchDoc, slug: string, m: Market | undefined): Finding {
  return {
    key: `nhl-candidate:${c.bet_id}`, kind: 'market', sport: 'NHL', title: `${candidateTitle(c, m)} (research candidate)`,
    statement: `Ask ${centsText(c.price.ask_cents)} at the research run, fair ${probText(c.p_model, 1)} (conservative ${probText(c.p_conservative, 1)}), bet up to ${centsText(c.bet_up_to_cents)}; ${TIER_WORD[c.robustness].toLowerCase()} — ${survivalText(c.survival.mass_survived, c.survival.survives, c.survival.survives?.length ?? 7).toLowerCase()}; ${STATUS_WORD[c.governance.status] ?? c.governance.status}. RESEARCH_ONLY.`,
    href: m ? routes.market(slug, m.market_id, r.event.event_id) : routes.game(slug, r.event.event_id, { tab: 'candidates' }),
    anchor: m ? { ref_kind: 'MARKET', id: m.market_id } : { ref_kind: 'EVENT', id: r.event.event_id }, kickoff: r.event.start_time_utc, eventStatus: r.event.status,
  };
}

function WhyCandidate({ c, s, r, slug, marketsByTicker, now }: { c: NhlCandidate; s: NhlScripts; r: EventResearchDoc; slug: string; marketsByTicker: Map<string, Market>; now: number }) {
  const m = marketsByTicker.get(c.ticker);
  const live = liveAskCents(m, c.side);
  const chk = priceCheck(live, c.bet_up_to_cents);
  const others = new Map(s.candidates.map((x) => [x.bet_id, x]));
  return (
    <div className="nwhy" role="region" aria-label={`Why ${candidateTitle(c, m)}`}>
      <div className="nwhy__grid">
        <div>
          <h4 className="nwhy__h">Scripts</h4>
          <ul className="nwhy__scripts">
            {s.scripts.map((x) => {
              const i = s.order.indexOf(x.id);
              const ev = c.survival.ev_by_script?.[i] ?? null;
              const ok = c.survival.survives?.[i];
              return <li key={x.id}><ScriptDot tone={x.tone} />{x.label} <small className="muted num">{probText(x.probability)}</small> <b className={`num ${ok ? 'nmx__v--yes' : 'nmx__v--no'}`}>{evText(ev)}</b></li>;
            })}
          </ul>
          <p className="small muted">{survivalText(c.survival.mass_survived, c.survival.survives, s.scripts.length)}; worst major script {evText(c.survival.worst_major_ev)}, best {evText(c.survival.best_major_ev)}.</p>
        </div>
        <div>
          <h4 className="nwhy__h">Model evidence</h4>
          <ul className="nwhy__list">{c.supporting.map((f) => <li key={f.text}><span className="nwhy__b">{f.basis.toLowerCase().replace(/_/g, ' ')}</span> {f.text}</li>)}</ul>
          {c.opposing.length > 0 && (
            <>
              <h4 className="nwhy__h">Against it</h4>
              <ul className="nwhy__list nwhy__list--neg">{c.opposing.map((f) => <li key={f.text}>{f.text}</li>)}</ul>
            </>
          )}
        </div>
        <div>
          <h4 className="nwhy__h">Price</h4>
          <p className="small">Research run ask <b className="num">{centsText(c.price.ask_cents)}</b>{c.price.observed_at_utc ? ` (${c.price.observed_at_utc.slice(11, 16)} UTC)` : ''} · live <SideAsk c={c} m={m} now={now} /> · bet up to <b className="num">{centsText(c.bet_up_to_cents)}</b></p>
          {chk === 'ABOVE_BET_UP_TO' && <p className="nwhy__warn small" role="note">The live ask is above the bet-up-to price: at this price the candidate no longer clears its conservative fair value.</p>}
          <p className="small">Fair {probText(c.p_model, 1)} · conservative {probText(c.p_conservative, 1)} · market {probText(c.p_market_mid, 1)} · edge after fee {evText(c.ev_adjusted)} (raw {evText(c.ev_raw)})</p>
          <p className="small muted">Family {c.family_reliability.toLowerCase().replace(/_/g, ' ')}{c.uncertainty.large_market_disagreement ? ` · ${c.uncertainty.disagreement_pts} pts from the market` : ''}</p>
        </div>
        <div>
          <h4 className="nwhy__h">Status</h4>
          <p className="small"><StatusChip status={c.governance.status} /> {c.governance.stake_kind}{c.governance.stake_dollars ? ` ($${c.governance.stake_dollars})` : ''}</p>
          {c.governance.reasons.length > 0 && <p className="small muted">{c.governance.reasons.map((x) => x.replace(/_/g, ' ').toLowerCase()).join('; ')}</p>}
          {c.dependencies.length > 0 && <ul className="nwhy__list">{c.dependencies.map((d) => <li key={d.flag}>Depends on: {d.text}</li>)}</ul>}
          {c.relations.length > 0 && (
            <ul className="nwhy__list">
              {c.relations.map((x) => <li key={x.bet_id}>{others.has(x.bet_id) ? x.text : x.text}</li>)}
            </ul>
          )}
          <DigDeeper finding={candidateFinding(c, r, slug, m)} compact />
        </div>
      </div>
    </div>
  );
}

export function CandidatesPanel({ s, r, marketsByTicker, slug, eventId, now, limit, to, title = 'Research Candidates' }: { s: NhlScripts; r: EventResearchDoc; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number; limit?: number; to?: string; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = s.candidates.slice(0, limit ?? s.candidates.length);
  return (
    <section className="panel ncands" aria-labelledby={`n-cands-h-${limit ?? 'all'}`}>
      <PanelHead
        title={title}
        sub={<>Ranked by robustness, not raw edge · <ResearchOnly /></>}
        info={
          <Info label="What a research candidate is">
            A contract the NHL research engine finds positive at its executable ask after Kalshi fees under both the model and a conservative,
            market-shrunk probability. <b>Survival</b> is the share of simulated games in the scripts where it stays at least +1¢ per contract. Robust
            candidates outrank fragile ones even when their raw edge is smaller. Candidates are research observations: nothing is placed.
          </Info>
        }
      />
      {rows.length === 0 ? (
        <p className="muted small">No contract on this game clears the research engine's bar at its executable ask. That is a valid result.</p>
      ) : (
        <ol className="nclist">
          {rows.map((c) => {
            const m = marketsByTicker.get(c.ticker);
            const isOpen = open === c.bet_id;
            const fail = c.survival.failure_script ? s.byId.get(c.survival.failure_script) : undefined;
            const live = liveAskCents(m, c.side);
            const chk = priceCheck(live, c.bet_up_to_cents);
            return (
              <li key={c.bet_id} className={`nc${c.governance.status === 'REJECTED' ? ' nc--rejected' : ''}${c.duplicate_of ? ' nc--dup' : ''}`}>
                <div className="nc__main">
                  <div className="nc__t">
                    {m ? <Link to={routes.market(slug, m.market_id, eventId)} className="nc__name">{candidateTitle(c, m)}</Link> : <span className="nc__name">{candidateTitle(c, m)}</span>}
                    <span className="nc__chips"><TierChip tier={c.robustness} /><StatusChip status={c.governance.status} /></span>
                  </div>
                  <p className="nc__surv">{survivalText(c.survival.mass_survived, c.survival.survives, s.scripts.length)}{fail ? <> · fails mainly if <b>{lowerLabel(fail.label)}</b></> : null}</p>
                  <p className="nc__nums">
                    <span>Fair <b className="num">{probText(c.p_model)}</b></span>
                    <span>Edge after fee <b className="num">{evText(c.ev_adjusted)}</b></span>
                    <span>Bet up to <b className="num">{centsText(c.bet_up_to_cents)}</b></span>
                    {c.dependencies.length > 0 && <span className="nc__dep">{dependencyShort(c.dependencies[0].flag)}{c.dependencies.length > 1 ? ` +${c.dependencies.length - 1}` : ''}</span>}
                  </p>
                  {c.duplicate_of && <p className="nc__rel small">{c.relations.find((x) => x.bet_id === c.duplicate_of)?.text ?? 'Same exposure as a higher-ranked candidate'}</p>}
                  {chk === 'ABOVE_BET_UP_TO' && <p className="nwhy__warn small" role="note">Live ask {centsText(live)} is above bet-up-to.</p>}
                  <button type="button" className="why__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.bet_id)}>
                    Why this candidate<Icon name="chevronDown" size={14} className={isOpen ? 'is-flipped' : undefined} />
                  </button>
                </div>
                <div className="nc__price"><SideAsk c={c} m={m} now={now} /><span className="nc__side">{sideLabel(c.side)}</span></div>
                {isOpen && <WhyCandidate c={c} s={s} r={r} slug={slug} marketsByTicker={marketsByTicker} now={now} />}
              </li>
            );
          })}
        </ol>
      )}
      {to && s.candidates.length > (limit ?? 0) && <div className="ov-surv__foot"><ViewAll to={to}>All {s.candidatesTotal} candidates</ViewAll></div>}
    </section>
  );
}

// ------------------------------------------------------------------ findings

export function findingTray(f: NhlFinding, r: EventResearchDoc, slug: string): Finding {
  return {
    key: `nhl-finding:${f.id}`, kind: f.basis === 'AVAILABILITY' ? 'injury' : f.basis === 'MODEL' ? 'projection' : 'matchup', sport: 'NHL',
    title: f.title, statement: `${f.text} [${BASIS_WORD[f.basis]}${f.source ? `; ${f.source}` : ''}]`,
    href: routes.game(slug, r.event.event_id, { tab: 'matchup' }), anchor: { ref_kind: 'EVENT', id: r.event.event_id },
    kickoff: r.event.start_time_utc, eventStatus: r.event.status,
  };
}

export function FindingCard({ f, r, slug }: { f: NhlFinding; r: EventResearchDoc; slug: string }) {
  return (
    <article className={`nfind nfind--${f.basis.toLowerCase()}`}>
      <header className="nfind__h"><BasisChip basis={f.basis} /><DigDeeper finding={findingTray(f, r, slug)} compact /></header>
      <h3 className="nfind__t">{f.title}</h3>
      <p className="nfind__x">{f.text}</p>
    </article>
  );
}

export function WhatMatters({ items, r, slug, empty, more }: { items: NhlFinding[]; r: EventResearchDoc; slug: string; empty?: ReactNode; more?: ReactNode }) {
  return (
    <section className="gsec" aria-labelledby="n-matters-h">
      <div className="gsec__h">
        <h2 id="n-matters-h" className="gsec__t">What Matters</h2>
        <p className="gsec__sub">The findings that move this game most, each labelled with what it rests on. Raw statistics are context, never the reason for an edge.</p>
      </div>
      {items.length ? <div className="nfgrid">{items.map((f) => <FindingCard key={f.id} f={f} r={r} slug={slug} />)}</div> : empty}
      {more}
    </section>
  );
}

// ------------------------------------------------------------------ goaltending & lines

interface GoalieView { team: string; name: string | null; status: string | null; confidence: number | null; source: string | null; timeline: number; factor: number | null; pid: string | null }

export function goalies(r: EventResearchDoc, findings: NhlFinding[], homeAbbr: string): GoalieView[] {
  const out: GoalieView[] = [];
  for (const l of (r.context?.lineups ?? []) as any[]) {
    if (l.kind !== 'goalie_status') continue;
    const side = l.team === homeAbbr ? 'home' : 'away';
    const f = findings.find((x) => x.id === `goalie_factor_${side}`);
    const p = r.players.find((x) => x.display_name === l.current?.player_name);
    out.push({ team: l.team, name: l.current?.player_name ?? null, status: l.current?.status ?? null, confidence: l.current?.confidence ?? null, source: l.current?.source ?? l.source ?? null, timeline: (l.timeline ?? []).length, factor: (f?.values as any)?.factor ?? null, pid: p?.participant_id ?? null });
  }
  return out;
}

const STATUS_COPY: Record<string, string> = { CONFIRMED: 'Confirmed', PROBABLE: 'Probable', PROJECTED: 'Projected', UNKNOWN: 'Unknown' };

export function GoaltendingPanel({ r, findings, homeAbbr, awayAbbr, slug }: { r: EventResearchDoc; findings: NhlFinding[]; homeAbbr: string; awayAbbr: string; slug: string }) {
  const gs = goalies(r, findings, homeAbbr).sort((a) => (a.team === awayAbbr ? -1 : 1));
  return (
    <section className="panel ngoal" aria-labelledby="n-goal-h">
      <PanelHead title="Goaltending" sub="Expected starters, status and what the model assumes" />
      {gs.length === 0 ? <p className="muted small">No goalie status published for this game; the model prices league-average goaltending.</p> : (
        <div className="ngoal__grid">
          {gs.map((g) => (
            <div key={g.team} className="ngoal__c">
              <span className="ngoal__team"><TeamMark sport="NHL" abbr={g.team} size="sm" /><span className="sr-only">{g.team}</span></span>
              <span className="ngoal__name">{g.pid ? <Link to={routes.player(slug, g.pid)}>{g.name}</Link> : g.name ?? 'Starter unknown'}</span>
              <span className={`ngoal__st ngoal__st--${(g.status ?? 'unknown').toLowerCase()}`}>{STATUS_COPY[g.status ?? 'UNKNOWN'] ?? g.status}{g.confidence != null ? ` · ${probText(g.confidence)} confidence` : ''}</span>
              <span className="ngoal__f small">{g.factor != null ? `Model goalie factor ${Number(g.factor).toFixed(2)} (${Number(g.factor) < 1 ? 'better' : 'worse'} than average; regressed goals vs expected)` : 'Model uses a near-average goalie factor'}</span>
              <span className="ngoal__src small muted">{g.source ?? ''}{g.timeline ? ` · ${g.timeline} status updates` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const UNIT_WORD: Record<string, string> = { f1: 'Line 1', f2: 'Line 2', f3: 'Line 3', f4: 'Line 4', d1: 'Pair 1', d2: 'Pair 2', d3: 'Pair 3', pp1: 'PP1', pp2: 'PP2', pk1: 'PK1', pk2: 'PK2' };

export function LinesPanel({ r, homeAbbr, awayAbbr, full }: { r: EventResearchDoc; homeAbbr: string; awayAbbr: string; full?: boolean }) {
  const lc = ((r.context?.lineups ?? []) as any[]).filter((l) => l.kind === 'line_combinations');
  const order = [awayAbbr, homeAbbr];
  lc.sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team));
  const units = full ? ['ev:f1', 'ev:f2', 'ev:f3', 'ev:f4', 'ev:d1', 'ev:d2', 'ev:d3', 'pp:pp1', 'pp:pp2', 'pk:pk1', 'pk:pk2'] : ['ev:f1', 'ev:f2', 'pp:pp1'];
  return (
    <section className="panel nlines" aria-labelledby="n-lines-h">
      <PanelHead title="Lines & Special Teams" sub={lc[0]?.lines_updated_at ? `Line combinations updated ${lc[0].lines_updated_at.slice(5, 16).replace('T', ' ')} UTC (DailyFaceoff)` : 'Line combinations'} />
      {lc.length === 0 ? <p className="muted small">No line combinations published for this game.</p> : (
        <div className="nlines__grid">
          {lc.map((t) => (
            <div key={t.team} className="nlines__team">
              <div className="nlines__th"><TeamMark sport="NHL" abbr={t.team} size="sm" /><span className="sr-only">{t.team}</span></div>
              <dl className="nlines__u">
                {units.filter((u) => t.units?.[u]).map((u) => (
                  <div key={u}><dt>{UNIT_WORD[u.split(':')[1]] ?? u}</dt><dd>{t.units[u].map((p: any) => p.name).join(' · ')}</dd></div>
                ))}
                {full && t.units?.['oi:ir'] && <div><dt>Out</dt><dd>{t.units['oi:ir'].map((p: any) => `${p.name}${p.injury_status ? ` (${p.injury_status})` : ''}`).join(' · ')}</dd></div>}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ status notes

export function ScriptsUnavailable({ status, reason }: { status: string; reason: string }) {
  const title = status === 'NOT_SIMULATED' ? 'No game scripts yet' : status === 'FAILED' ? 'The script layer failed for this game' : 'No NHL script layer for this game';
  const why = reason ? `${reason[0].toUpperCase()}${reason.slice(1).replace(/\.$/, '')}.` : '';
  return (
    <div className="nunav" role="note">
      <b>{title}.</b> {why} Sift shows no scripts or candidates rather than inventing them.
    </div>
  );
}

export function ProbabilityPair({ label, model, market }: { label: string; model: number | null; market: number | null }) {
  return (
    <div className="npair">
      <span className="npair__l">{label}</span>
      <span className="npair__v"><b className="num">{probText(model)}</b><small>model</small></span>
      <span className="npair__v"><b className="num">{probText(market)}</b><small>market</small></span>
    </div>
  );
}

/** A script label mid-sentence: "tight, low-event game", but "VGK controls and pulls away" keeps its abbreviation. */
export function lowerLabel(label: string): string {
  return /^[A-Z]{2,3}\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Team of a named player from the game's own rosters and line combinations (injury lists name no team). */
export function teamResolver(r: EventResearchDoc, rosters: { abbr: string; names: string[] }[]): (name: string) => string | null {
  const by = new Map<string, string>();
  const key = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  for (const t of rosters) for (const n of t.names) by.set(key(n), t.abbr);
  for (const l of (r.context?.lineups ?? []) as any[]) {
    if (l.kind !== 'line_combinations') continue;
    for (const ps of Object.values(l.units ?? {}) as any[]) for (const p of ps) if (p?.name) by.set(key(p.name), l.team);
  }
  return (name: string) => by.get(key(name)) ?? null;
}
