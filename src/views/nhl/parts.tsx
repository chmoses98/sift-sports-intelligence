// NHL research primitives shared by the NHL screens: tier / basis / status chips, the learning badge, the live side
// ask, the cross-script survival matrix, basis-labelled finding cards, line combinations and the scripts-unavailable
// note. Everything renders the NHL publication's structured research as published (lib/nhl.ts); Sift adds wording,
// never a probability. The game story itself lives in story.tsx.
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import type { EventResearchDoc, Market } from '../../contract/types';
import { DigDeeper, TeamMark } from '../../components/ui';
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
  evAt,
  evText,
  learningLine,
  liveAskCents,
  probText,
  sideLabel,
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
import { PanelHead } from '../game/panels';
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

export function scriptFinding(s: NhlScript, r: EventResearchDoc, slug: string, label: string): Finding {
  return {
    key: `nhl-script:${s.id}`, kind: 'script', sport: 'NHL', title: `${label}: ${s.label} (${probText(s.probability)})`,
    statement: `${s.summary} NHL_SCRIPT_V1, ${probText(s.probability)} of simulated games; ${s.totalRange ? `total ${s.totalRange.p10}–${s.totalRange.p90} goals` : ''}.`,
    href: routes.game(slug, r.event.event_id, { tab: 'script', script: s.id }), anchor: { ref_kind: 'EVENT', id: r.event.event_id },
    kickoff: r.event.start_time_utc, eventStatus: r.event.status,
  };
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

// ------------------------------------------------------------------ goaltending & lines

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
