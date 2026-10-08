// The NHL game story, section by section: the summary under the hero, "how this game is most likely to play", the
// goalie matchup, the game scripts, market fit with its contradiction check, special teams and player research.
// Every number is the publication's (lib/nhl.ts) or an exact identity over it (lib/nhlStory.ts); the words are fixed
// templates. Missing inputs are omitted, never defaulted.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { EntityProfileDoc, EventResearchDoc, Market, MatchupRow, Observation } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { DigDeeper } from '../../components/ui';
import { describeNhlMarket } from '../../lib/marketLabel';
import { candidateTitle, centsText, evText, type NhlCandidate, type NhlScript, type NhlScripts } from '../../lib/nhl';
import {
  FIT_HELP,
  FIT_TITLE,
  SCORING_WORD,
  ageMs,
  ageWords,
  conflicts as findConflicts,
  marketFit,
  scoringEnvironment,
  scriptSwing,
  type Conflict,
  type FitGroup,
  type FitItem,
  type GoalieLine,
  type PhaseView,
  type PlayerLine,
  type Projection,
  type SideIds,
  type Thesis,
} from '../../lib/nhlStory';
import { nhlTeam } from '../../lib/nhlTeams';
import { routes } from '../../lib/routes';
import { Info } from '../game/panels';
import { familyGlyph, Glyph, SCRIPT_GLYPH } from './glyphs';
import { GoalieBadge, Stat, TeamChip, WinSplit } from './kit';
import { ScriptDot, SideAsk, StatusChip, TierChip, lowerLabel, scriptFinding } from './parts';

/* eslint-disable @typescript-eslint/no-explicit-any */

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function Section({ id, title, sub, info, actions, children, className }: { id: string; title: string; sub?: ReactNode; info?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`nst${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-h`} id={id}>
      <header className="nst__head">
        <div className="nst__titles">
          <h2 className="nst__t" id={`${id}-h`}>{title}{info}</h2>
          {sub && <p className="nst__sub">{sub}</p>}
        </div>
        {actions && <div className="nst__x">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ summary strip (below the hero)

export function SummaryStrip({ ids, p, s, phase, marketPHome, status }: { ids: SideIds; p: Projection | null; s: NhlScripts | null; phase: PhaseView; marketPHome: number | null; status: ReactNode }) {
  const top = s?.scripts[0];
  const scoring = scoringEnvironment(p);
  return (
    <div className="nsum">
      <div className="nsum__win">
        <span className="nsum__k">{phase.phase === 'UPCOMING' ? 'Model win probability' : 'Pregame model win probability'}</span>
        <div className="nsum__ws">
          <TeamChip abbr={ids.away} size="sm" />
          <WinSplit home={ids.home} away={ids.away} pHome={p?.pHome ?? null} />
          <TeamChip abbr={ids.home} size="sm" />
        </div>
        {p?.pHome == null ? <span className="nsum__note">Not simulated yet</span> : marketPHome != null ? <span className="nsum__note">Market {ids.home} {pct(marketPHome)}{phase.phase !== 'UPCOMING' ? ' (live, not pregame)' : ''}</span> : null}
      </div>
      <div className="nsum__stats">
        {p?.total != null && <Stat glyph="total" label="Projected total" value={<span className="num">{p.total.toFixed(1)}</span>} sub={[p.totalRange ? `90%: ${p.totalRange.lo}–${p.totalRange.hi}` : null, scoring ? SCORING_WORD[scoring] : null].filter(Boolean).join(' · ')} />}
        {top && <Stat glyph={SCRIPT_GLYPH[top.id]} label="Most likely script" value={<>{top.short} <span className="num">{pct(top.probability)}</span></>} sub={`of ${s!.nDraws.toLocaleString('en-US')} simulated games`} />}
        {p?.pOvertime != null && <Stat glyph="overtime" label="Overtime" value={<span className="num">{pct(p.pOvertime)}</span>} sub="of simulations" />}
      </div>
      <div className="nsum__status">{status}</div>
    </div>
  );
}

// ------------------------------------------------------------------ live / final notes

export function FrozenNote({ phase, generatedAt }: { phase: PhaseView; generatedAt: string | null }) {
  if (phase.phase === 'UPCOMING') return null;
  return (
    <p className={`nfrozen nfrozen--${phase.phase.toLowerCase()}`} role="note">
      <Glyph name={phase.phase === 'FINAL' ? 'goal' : 'overtime'} size={16} />
      <span>
        {phase.phase === 'LIVE' ? <b>Puck has dropped.</b> : <b>Final.</b>} The research below is the model's pregame read{generatedAt ? `, frozen at ${new Date(generatedAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}` : ''}.
        {phase.phase === 'LIVE' ? ' Live prices move with the score and are never a new pregame signal.' : ' It is kept for review against the result.'}
      </span>
    </p>
  );
}

/** A final game against its pregame read: the score and, once the publisher has reviewed it, the realized script. */
export function ReviewSection({ phase, ids, s }: { phase: PhaseView; ids: SideIds; s: NhlScripts | null }) {
  if (phase.phase !== 'FINAL') return null;
  const o = (s?.outcome ?? null) as any;
  const rs = o?.realized_script ? s?.byId.get(o.realized_script) ?? null : null;
  const fs = o?.final_score ?? null;
  // The publisher's postmortem score is authoritative over the schedule feed's last captured score.
  const score = fs?.home != null && fs?.away != null ? { home: Number(fs.home), away: Number(fs.away) } : phase.score;
  const rank = o?.realized_rank ?? (rs ? s!.scripts.indexOf(rs) + 1 : null);
  return (
    <Section id="n-review" title="Review" sub="The pregame read against what happened. One game proves nothing: calibration is measured across every settled game on the scorecard.">
      <div className="nrev">
        <div className="nrev__score" aria-label={score ? `Final: ${ids.away} ${score.away}, ${ids.home} ${score.home}` : 'Final score not published'}>
          <TeamChip abbr={ids.away} size="lg" /><b className="num">{score?.away ?? '–'}</b>
          <span className="nrev__dash">{o?.shootout ? 'SO' : o?.overtime ? 'OT' : 'Final'}</span>
          <b className="num">{score?.home ?? '–'}</b><TeamChip abbr={ids.home} size="lg" />
        </div>
        <ul className="nrev__l">
          {s?.scripts[0] && <li><span>Most likely pregame script</span><b><ScriptDot tone={s.scripts[0].tone} />{s.scripts[0].label} · {pct(s.scripts[0].probability)}</b></li>}
          {o?.realized_script ? (
            <li><span>Script that happened</span><b>{rs && <ScriptDot tone={rs.tone} />}{o.realized_label ?? rs?.label ?? o.realized_script}{o.p_realized != null ? ` · forecast ${pct(o.p_realized)}` : ''}{rank && (o.n_scripts ?? s?.scripts.length) ? ` (ranked ${rank} of ${o.n_scripts ?? s!.scripts.length})` : ''}</b></li>
          ) : <li><span>Script that happened</span><b className="muted">Not yet reviewed by the publisher</b></li>}
          {o?.brier != null && o?.base_rate_brier != null && <li><span>Script forecast score</span><b>Brier <span className="num">{Number(o.brier).toFixed(3)}</span> vs <span className="num">{Number(o.base_rate_brier).toFixed(3)}</span> for league base rates (lower is better)</b></li>}
          {s && <li><span>Research candidates</span><b>{s.candidates.filter((c) => c.governance.status !== 'REJECTED').length} tracked pregame; results settle into the scorecard</b></li>}
        </ul>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ thesis

const DRIVER_GLYPH: Record<string, string> = { strength: 'territory', pace: 'highEvent', shots: 'shotVolume', goalies: 'mask', special: 'powerPlay', home: 'puck', rest: 'overtime', injuries: 'lines' };

export function ThesisSection({ t, s, r, slug, ids }: { t: Thesis; s: NhlScripts | null; r: EventResearchDoc; slug: string; ids: SideIds }) {
  return (
    <Section id="n-thesis" title="How this game is most likely to play" className="nst--thesis"
      actions={s?.scripts[0] ? <DigDeeper finding={scriptFinding(s.scripts[0], r, slug, `${ids.away} at ${ids.home}`)} compact /> : undefined}>
      <div className="nthesis">
        <p className="nthesis__h">{t.headline}</p>
        {t.shape.length > 0 && <p className="nthesis__p">{t.shape.join(' ')}</p>}
        {t.drivers.length > 0 && (
          <ul className="nthesis__d" aria-label="Biggest drivers">
            {t.drivers.map((d) => (
              <li key={d.key}><span className="nthesis__dk"><Glyph name={DRIVER_GLYPH[d.key] ?? 'puck'} size={16} />{d.label}</span><span>{d.text}</span></li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ goalie matchup

interface GoalieStats { sv: number | null; svN: number | null; svSeason: string | null; ev: number | null; gaa: number | null; starts: number | null; cur: { sv: number | null; starts: number | null; season: string } | null; lastStart: string | null; startsLast7: number; recentSa: number | null }

function obs(p: EntityProfileDoc | null | undefined, metric: string, season?: string): Observation | null {
  const xs = (p?.metrics ?? []).filter((o) => o.metric_id === metric && (!season || o.window?.label === season));
  return xs[0] ?? null;
}

function goalieStats(p: EntityProfileDoc | null | undefined, before: string): GoalieStats | null {
  if (!p) return null;
  const seasons = [...new Set((p.metrics ?? []).filter((o) => o.metric_id === 'met_nhl.save_pct' && /^\d{4}-\d{2}$/.test(o.window?.label ?? '')).map((o) => o.window.label))].sort();
  const cur = seasons[seasons.length - 1] ?? null;
  // The last season with a real sample (20+ starts) is the reference; the current season shows beside it.
  const ref = [...seasons].reverse().find((s) => (obs(p, 'met_nhl.goalie_starts', s)?.value ?? 0) >= 20) ?? cur;
  const gl = (p.extensions as any)?.game_log;
  const cols: string[] = gl?.columns ?? [];
  const idx = (c: string) => cols.indexOf(c);
  const rows: any[][] = (gl?.rows ?? []).filter((x: any[]) => String(x[idx('date')]) < before.slice(0, 10) && x[idx('start')] === true);
  rows.sort((a, b) => String(a[idx('date')]).localeCompare(String(b[idx('date')])));
  const last = rows[rows.length - 1];
  const weekAgo = new Date(Date.parse(before) - 7 * 86400e3).toISOString().slice(0, 10);
  const recent = rows.slice(-5).map((x) => Number(x[idx('sa')])).filter((v) => Number.isFinite(v));
  return {
    sv: obs(p, 'met_nhl.save_pct', ref ?? undefined)?.value ?? null, svN: obs(p, 'met_nhl.goalie_starts', ref ?? undefined)?.value ?? null, svSeason: ref,
    ev: obs(p, 'met_nhl.ev_save_pct', ref ?? undefined)?.value ?? null, gaa: obs(p, 'met_nhl.gaa', ref ?? undefined)?.value ?? null,
    starts: obs(p, 'met_nhl.goalie_starts', ref ?? undefined)?.value ?? null,
    cur: cur && cur !== ref ? { sv: obs(p, 'met_nhl.save_pct', cur)?.value ?? null, starts: obs(p, 'met_nhl.goalie_starts', cur)?.value ?? null, season: cur } : null,
    lastStart: last ? String(last[idx('date')]) : null, startsLast7: rows.filter((x) => String(x[idx('date')]) >= weekAgo).length,
    recentSa: recent.length >= 3 ? recent.reduce((a, b) => a + b, 0) / recent.length : null,
  };
}

const sv3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''));

function GoalieCard({ g, prof, factor, faces, saves, savesMarket, s, start, now, slug }: {
  g: GoalieLine; prof: EntityProfileDoc | null | undefined; factor: number | null; faces: number | null; saves: number | null;
  savesMarket: { label: string; model: number | null; market: number | null; m: Market } | null; s: NhlScripts | null; start: string; now: number; slug: string;
}) {
  const st = goalieStats(prof, start);
  const confirmed = g.status === 'CONFIRMED';
  const rest = st?.lastStart ? Math.round((Date.parse(start) - Date.parse(`${st.lastStart}T23:00:00Z`)) / 86400e3) : null;
  const t = nhlTeam(g.team);
  return (
    <article className={`ngc${confirmed ? '' : ' ngc--unconf'}`} aria-label={`${t?.name ?? g.team} goalie ${g.name ?? 'unknown'}`}>
      <header className="ngc__h">
        <TeamChip abbr={g.team} size="md" />
        <span className="ngc__mask"><Glyph name="mask" size={20} /></span>
      </header>
      <div className="ngc__who">
        {g.pid ? <Link to={routes.player(slug, g.pid)} className="ngc__name">{g.name}</Link> : <span className="ngc__name">{g.name ?? 'Starter not published'}</span>}
        <span className="ngc__st"><GoalieBadge status={g.status} />{g.confidence != null && <span>{pct(g.confidence)} confidence</span>}{g.observedAt && <span>updated {ageWords(ageMs(g.observedAt, now))}</span>}</span>
      </div>
      {!confirmed && <p className="ngc__warn" role="note"><Glyph name="alert" size={14} />Not confirmed. The projection assumes this starter; a different goalie changes the read.</p>}
      <dl className="ngc__kv">
        {st?.sv != null && <div><dt>Save %</dt><dd className="num">{sv3(st.sv)}<small>{st.svSeason}{st.starts != null ? ` · ${st.starts} starts` : ''}</small></dd></div>}
        {st?.ev != null && <div><dt>Even-strength SV%</dt><dd className="num">{sv3(st.ev)}</dd></div>}
        {st?.gaa != null && <div><dt>GAA</dt><dd className="num">{st.gaa.toFixed(2)}</dd></div>}
        {st?.cur && st.cur.starts ? <div><dt>{st.cur.season}</dt><dd className="num">{sv3(st.cur.sv)}<small>{st.cur.starts} start{st.cur.starts === 1 ? '' : 's'}: tiny sample</small></dd></div> : null}
        {st?.lastStart && <div><dt>Workload</dt><dd>Last start {new Date(`${st.lastStart}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{rest != null && rest >= 0 ? (rest > 30 ? ' (first start since then)' : ` (${rest} day${rest === 1 ? '' : 's'} rest)`) : ''} · {st.startsLast7} in the last 7 days{st.recentSa != null ? ` · faced ${st.recentSa.toFixed(0)} shots a start lately` : ''}</dd></div>}
        {factor != null && <div><dt>Model goalie factor</dt><dd className="num">{factor.toFixed(2)}<small>{factor < 1 ? 'saves more than average' : factor > 1 ? 'allows more than average' : 'average'} (opponent goals ×{factor.toFixed(2)})</small></dd></div>}
      </dl>
      {(faces != null || saves != null) && (
        <div className="ngc__proj">
          {faces != null && <Stat glyph="shots" label="Shots faced" value={<span className="num">{faces.toFixed(1)}</span>} sub="model expectation" />}
          {saves != null && <Stat glyph="saves" label="Saves" value={<span className="num">{saves.toFixed(1)}</span>} sub="model expectation" />}
          {savesMarket && (
            <Stat glyph="saves" label={savesMarket.label} value={<span className="num">{pct(savesMarket.model)}</span>} sub={<>model · market {pct(savesMarket.market)}</>} />
          )}
        </div>
      )}
      {s && <p className="ngc__foot">Saves by script: {s.scripts.slice(0, 4).map((x) => `${x.short} ${(g.side === 'home' ? x.homeSaves : x.awaySaves)?.toFixed(0) ?? '—'}`).join(' · ')}</p>}
    </article>
  );
}

export function GoalieMatchup({ goalies, profiles, p, s, markets, start, now, slug, ids }: {
  goalies: GoalieLine[]; profiles: Map<string, EntityProfileDoc | null>; p: Projection | null; s: NhlScripts | null; markets: Market[]; start: string; now: number; slug: string; ids: SideIds;
}) {
  const unconf = goalies.filter((g) => g.status !== 'CONFIRMED');
  const savesMarket = (g: GoalieLine) => {
    const ms = markets.filter((m) => m.market_family === 'goalie_saves' && g.name && m.yes_description.startsWith(`${g.name}:`));
    // The line closest to even money is the informative one.
    const rows = ms.map((m) => ({ m, row: s?.markets.get(m.kalshi_ticker) })).filter((x) => x.row?.pYes != null);
    rows.sort((a, b) => Math.abs((a.row!.pYesMid ?? a.row!.pYes!) - 0.5) - Math.abs((b.row!.pYesMid ?? b.row!.pYes!) - 0.5));
    const x = rows[0];
    return x ? { label: (describeNhlMarket(x.m)?.title ?? x.m.yes_description).replace(/^.*?:\s*/, ''), model: x.row!.pYes, market: x.row!.pYesMid, m: x.m } : null;
  };
  return (
    <Section id="n-goalies" title="Goalie matchup" sub={unconf.length ? `${unconf.length === 2 ? 'Neither starter is' : `${unconf[0].team}'s starter is not`} confirmed: research confidence is lower until it is.` : goalies.length ? 'Both starters confirmed.' : undefined}>
      {goalies.length === 0 ? <p className="nsl__muted">No goalie status published for this game; the model prices league-average goaltending.</p> : (
        <div className="ngm">
          {goalies.map((g) => (
            <GoalieCard key={g.team} g={g} prof={g.pid ? profiles.get(g.pid) : null} now={now} start={start} slug={slug} s={s}
              factor={g.side === 'home' ? p?.homeGoalieFactor ?? null : p?.awayGoalieFactor ?? null}
              faces={p?.shots ? (g.side === 'home' ? p.shots.away : p.shots.home) : null}
              saves={p?.saves ? (g.side === 'home' ? p.saves.home : p.saves.away) : null}
              savesMarket={savesMarket(g)} />
          ))}
          <span className="ngm__vs" aria-hidden="true">{ids.away} · {ids.home}</span>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ scripts

function baseWord(x: NhlScript): string | null {
  if (x.leagueBaseRate == null) return null;
  const d = x.probability - x.leagueBaseRate;
  return `${Math.abs(d) < 0.015 ? 'about the' : d > 0 ? 'above the' : 'below the'} ${pct(x.leagueBaseRate)} league rate`;
}

/** Every script in one compact list, most likely first: glyph, name, probability, what it looks like. */
export function ScriptList({ s, ids, hrefFor, selected }: { s: NhlScripts; ids: SideIds; hrefFor: (id: string | null) => string; selected?: string | null }) {
  return (
    <ol className="nscl">
      {s.scripts.map((x) => (
        <li key={x.id}>
          <Link to={hrefFor(x.id)} className={`nscl__a nsrow--s${x.tone}${selected === x.id ? ' is-sel' : ''}`}>
            <span className="nscl__ic"><Glyph name={SCRIPT_GLYPH[x.id] ?? 'puck'} size={18} /></span>
            <span className="nscl__main">
              <span className="nscl__t">{x.label}</span>
              <span className="nscl__d">{x.summary}</span>
            </span>
            <span className="nscl__p"><b className="num">{pct(x.probability)}</b><small>{baseWord(x)}</small></span>
            {x.homeGoals != null && <span className="nscl__m num">{ids.away} {x.awayGoals?.toFixed(1)} – {ids.home} {x.homeGoals.toFixed(1)}</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function marketName(title: string, m: Market | undefined): string {
  return (m ? describeNhlMarket(m)?.title : null) ?? title.replace(/^Full Game: /, 'Game: ');
}

/** One script in full: what creates it, what breaks it, its numbers, the markets it lifts and the ideas it breaks. */
export function ScriptCard({ x, s, ids, slug, eventId, marketsByTicker, r }: { x: NhlScript; s: NhlScripts; ids: SideIds; slug: string; eventId: string; marketsByTicker: Map<string, Market>; r: EventResearchDoc }) {
  const i = s.order.indexOf(x.id);
  const live = s.candidates.filter((c) => c.governance.status !== 'REJECTED');
  const hold = live.filter((c) => c.survival.survives?.[i]);
  const fail = live.filter((c) => c.survival.survives && !c.survival.survives[i]);
  const byBet = new Map(s.candidates.map((c) => [c.bet_id, c]));
  const vuln = x.hurts.map((h) => {
    const [ticker, side] = h.bet_id.split('|') as [string, string | undefined];
    const m = marketsByTicker.get(ticker);
    const c = byBet.get(h.bet_id);
    const title = c ? candidateTitle(c, m) : `${marketName(m?.yes_description ?? ticker, m)}${side === 'no' ? ' — NO' : ''}`;
    return { key: h.bet_id, title, m, drop: h.ev_drop };
  });
  return (
    <article className={`nscr nsd--s${x.tone}`} id={`script-${x.id}`} aria-labelledby={`script-${x.id}-h`}>
      <header className="nscr__h">
        <span className="nscr__ic"><Glyph name={SCRIPT_GLYPH[x.id] ?? 'puck'} size={20} /></span>
        <h3 className="nscr__t" id={`script-${x.id}-h`}>{x.label}</h3>
        <span className="nscr__p num">{pct(x.probability)}</span>
        <DigDeeper finding={scriptFinding(x, r, slug, `${ids.away} at ${ids.home}`)} compact />
      </header>
      <p className="nscr__sum">{x.summary} <span className="muted">{baseWord(x) ? `${pct(x.probability)} here, ${baseWord(x)}.` : ''}</span></p>
      <div className="nscr__cond">
        <div><span className="nscr__k">What creates it</span><p>{x.needs}</p></div>
        <div><span className="nscr__k">What breaks it</span><p>{x.breaks}</p></div>
      </div>
      <ul className="nscr__nums">
        {x.homeGoals != null && <li><Glyph name="goal" size={14} /><span>Goals</span><b className="num">{ids.away} {x.awayGoals?.toFixed(1)} – {ids.home} {x.homeGoals.toFixed(1)}</b></li>}
        {x.homeShots != null && <li><Glyph name="shots" size={14} /><span>Shots</span><b className="num">{ids.away} {x.awayShots?.toFixed(0)} – {ids.home} {x.homeShots.toFixed(0)}</b></li>}
        {x.homeSaves != null && <li><Glyph name="saves" size={14} /><span>Starter saves</span><b className="num">{ids.away} {x.awaySaves?.toFixed(0)} · {ids.home} {x.homeSaves.toFixed(0)}</b></li>}
        {x.homePpGoals != null && <li><Glyph name="powerPlay" size={14} /><span>PP goals</span><b className="num">{ids.away} {x.awayPpGoals?.toFixed(2)} · {ids.home} {x.homePpGoals.toFixed(2)}</b></li>}
        {x.pOvertime != null && <li><Glyph name="overtime" size={14} /><span>Overtime</span><b className="num">{pct(x.pOvertime)}</b></li>}
        {x.enShare != null && x.enShare > 0 && <li><Glyph name="emptyNet" size={14} /><span>Empty-net goals</span><b className="num">{pct(x.enShare)} of goals</b></li>}
      </ul>
      <div className="nscr__mk">
        <div>
          <span className="nscr__k nscr__k--pos">Markets it lifts</span>
          {x.helps.length ? (
            <ul className="nscr__list">{x.helps.map((h) => {
              const m = marketsByTicker.get(h.ticker);
              const t = `${marketName(h.title, m)}${h.side === 'no' ? ' — NO' : ''}`;
              return <li key={h.ticker + h.side}><Glyph name={familyGlyph(h.family)} size={14} />{m ? <Link to={routes.market(slug, m.market_id, eventId)}>{t}</Link> : <span>{t}</span>}<span className="nscr__mv num">{pct(h.p)} → {pct(h.p_given_script)}</span></li>;
            })}</ul>
          ) : <p className="nsl__muted">No market moves 5+ points in this script.</p>}
        </div>
        <div>
          <span className="nscr__k nscr__k--neg">Markets it hurts</span>
          {vuln.length ? (
            <ul className="nscr__list">{vuln.map((v) => (
              <li key={v.key}><Glyph name="alert" size={14} />{v.m ? <Link to={routes.market(slug, v.m.market_id, eventId)}>{v.title}</Link> : <span>{v.title}</span>}<span className="nscr__mv num nscr__mv--neg">{evText(v.drop)}</span></li>
            ))}</ul>
          ) : <p className="nsl__muted">No priced side loses much value here.</p>}
        </div>
      </div>
      {live.length > 0 && (
        <p className="nscr__rob">
          <b>{hold.length} of {live.length}</b> research ideas hold up in this script{fail.length ? <> · fails: {fail.slice(0, 3).map((c) => candidateTitle(c, marketsByTicker.get(c.ticker))).join(', ')}{fail.length > 3 ? ` +${fail.length - 3}` : ''}</> : null}
        </p>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ market fit

const GROUP_ORDER: FitGroup[] = ['FITS', 'SURVIVES', 'DEPENDENT', 'CONFLICTS'];
const GROUP_GLYPH: Record<FitGroup, string> = { FITS: 'territory', SURVIVES: 'saves', DEPENDENT: 'backAndForth', CONFLICTS: 'alert', HIGH_VARIANCE: 'goal' };

function ScriptTicks({ s, c }: { s: NhlScripts; c: NhlCandidate }) {
  return (
    <span className="nticks" aria-label={`Holds in ${s.scripts.filter((x) => c.survival.survives?.[s.order.indexOf(x.id)]).map((x) => x.short).join(', ') || 'no script'}`}>
      {s.scripts.map((x) => {
        const ok = c.survival.survives?.[s.order.indexOf(x.id)];
        return <i key={x.id} className={`nticks__t ndot--s${x.tone}${ok ? '' : ' is-off'}`} title={`${x.label} ${pct(x.probability)}: ${ok ? 'holds' : 'fails'}`} />;
      })}
    </span>
  );
}

function FitRow({ it, s, m, slug, eventId, now, pregame }: { it: FitItem; s: NhlScripts; m: Market | undefined; slug: string; eventId: string; now: number; pregame: boolean }) {
  const c = it.c;
  const title = candidateTitle(c, m);
  return (
    <li className="nfr">
      <span className="nfr__ic"><Glyph name={familyGlyph(c.family)} size={18} /></span>
      <div className="nfr__main">
        <div className="nfr__t">
          {m ? <Link to={routes.market(slug, m.market_id, eventId)}>{title}</Link> : <span>{title}</span>}
          {c.team && <TeamChip abbr={c.team} size="sm" className="nfr__team" />}
        </div>
        <p className="nfr__why">{it.reason}</p>
        <div className="nfr__meta">
          <ScriptTicks s={s} c={c} />
          <TierChip tier={c.robustness} />
          <StatusChip status={c.governance.status} />
          <span className="nfr__n">Fair <b className="num">{pct(c.p_model)}</b></span>
          <span className="nfr__n">Edge after fee <b className="num">{evText(c.ev_adjusted)}</b></span>
          <span className="nfr__n">Bet up to <b className="num">{centsText(c.bet_up_to_cents)}</b></span>
        </div>
      </div>
      <div className="nfr__px">
        {pregame ? <SideAsk c={c} m={m} now={now} /> : <span className="price price--stale" title="Research-run ask, frozen at puck drop">{centsText(c.price.ask_cents)}</span>}
        <small>{c.side.toUpperCase()}{pregame ? '' : ' · pregame'}</small>
      </div>
    </li>
  );
}

export function MarketFit({ s, marketsByTicker, slug, eventId, now, pregame, limit, to }: { s: NhlScripts; marketsByTicker: Map<string, Market>; slug: string; eventId: string; now: number; pregame: boolean; limit?: number; to?: string }) {
  const items = useMemo(() => marketFit(s), [s]);
  const conf = useMemo(() => findConflicts(s, items), [s, items]);
  const hv = items.filter((x) => x.group === 'HIGH_VARIANCE');
  const groups = GROUP_ORDER.map((g) => ({ g, rows: items.filter((x) => x.group === g) })).filter((x) => x.rows.length);
  const total = items.length;
  return (
    <Section id="n-fit" title="Market fit" sub={<>How each research idea relates to the scripts, from the model's per-script survival. Research only: nothing is placed.</>}
      info={<Info label="How market fit is decided">Each research candidate is positive at its executable ask after Kalshi fees and the conservative haircut. Sift groups them by the published survival bits: whether the idea holds in the most likely script, its tier (robust / moderate / fragile) and the share of simulated games it survives. No probability is recomputed.</Info>}
      actions={to && total > (limit ?? total) ? <Link to={to} className="nlink">Every idea <Icon name="arrowRight" size={14} /></Link> : undefined}>
      {total === 0 ? <p className="nsl__muted">No contract on this game clears the research bar at its executable ask. That is a valid result.</p> : (
        <>
          <ConflictCheck s={s} conflicts={conf} marketsByTicker={marketsByTicker} n={items.filter((x) => x.group !== 'HIGH_VARIANCE').length} />
          <p className="nmf__key"><span className="nticks" aria-hidden="true">{s.scripts.map((x) => <i key={x.id} className={`nticks__t ndot--s${x.tone}`} />)}</span> the seven scripts, most likely first: filled where the idea holds, hollow where it fails.</p>
          <div className="nmf">
            {groups.map(({ g, rows }) => (
              <div key={g} className={`nmf__g nmf__g--${g.toLowerCase()}`}>
                <h3 className="nmf__h"><Glyph name={GROUP_GLYPH[g]} size={16} />{FIT_TITLE[g]} <span className="nmf__c">{rows.length}</span></h3>
                <p className="nmf__help">{FIT_HELP[g]}</p>
                <ol className="nmf__l">
                  {rows.slice(0, limit ?? rows.length).map((it) => <FitRow key={it.c.bet_id} it={it} s={s} m={marketsByTicker.get(it.c.ticker)} slug={slug} eventId={eventId} now={now} pregame={pregame} />)}
                </ol>
                {limit && rows.length > limit && <p className="nsl__muted">+{rows.length - limit} more on the Markets tab</p>}
              </div>
            ))}
          </div>
          {hv.length > 0 && (
            <details className="layer nmf__hv">
              <summary className="layer__s">High-variance research: goal scorers ({hv.length})</summary>
              <div className="layer__b">
                <p className="nmf__help">{FIT_HELP.HIGH_VARIANCE}</p>
                <ol className="nmf__l">{hv.map((it) => <FitRow key={it.c.bet_id} it={it} s={s} m={marketsByTicker.get(it.c.ticker)} slug={slug} eventId={eventId} now={now} pregame={pregame} />)}</ol>
              </div>
            </details>
          )}
          {s.candidatesTotal > s.candidates.length && <p className="nsl__muted">{s.candidatesTotal} candidates on this game; the publication carries the top {s.candidates.length}.</p>}
        </>
      )}
    </Section>
  );
}

export function ConflictCheck({ s, conflicts, marketsByTicker, n }: { s: NhlScripts; conflicts: Conflict[]; marketsByTicker: Map<string, Market>; n: number }) {
  if (n < 2) return null;
  return (
    <div className={`ncc${conflicts.length ? ' ncc--hit' : ''}`} role="note" aria-label="Contradiction check">
      <span className="ncc__h"><Glyph name={conflicts.length ? 'alert' : 'saves'} size={16} />Contradiction check</span>
      {conflicts.length === 0 ? (
        <p>No contradictory pair among the {n} research ideas: every pair holds together in at least a quarter of simulated games, and the model marks none as offsetting.</p>
      ) : (
        <ul>
          {conflicts.slice(0, 4).map((c) => (
            <li key={c.a.bet_id + c.b.bet_id}>
              <b>{candidateTitle(c.a, marketsByTicker.get(c.a.ticker))}</b> vs <b>{candidateTitle(c.b, marketsByTicker.get(c.b.ticker))}</b>
              <span>{c.source === 'MODEL' ? `${c.text}. Both hold in ${pct(c.together)} of simulated games.` : c.text}</span>
            </li>
          ))}
          {conflicts.length > 4 && <li className="nsl__muted">+{conflicts.length - 4} more pairs</li>}
        </ul>
      )}
      {s.scripts.length > 0 && conflicts.length > 0 && <p className="ncc__foot">Ideas in a pair need different games: holding both is a bet that the game does not follow either story.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ special teams

export function SpecialTeams({ s, p, ids, matchup, lineups }: { s: NhlScripts | null; p: Projection | null; ids: SideIds; matchup: MatchupRow[]; lineups: Record<string, unknown>[] }) {
  const st = s?.byId.get('SPECIAL_TEAMS') ?? null;
  const row = (id: string) => matchup.find((x) => x.metric_id === id);
  const pp = row('met_nhl.pp_pct');
  const pk = row('met_nhl.pk_pct');
  const pp1 = (team: string) => ((lineups as any[]).find((l) => l.kind === 'line_combinations' && l.team === team)?.units?.['pp:pp1'] ?? []).map((x: any) => x.name as string);
  if (!st && !pp && !pk && !p?.ppGoals) return null;
  const ppShare = s ? s.scripts.reduce((a, x) => a + x.probability * (x.ppShare ?? 0), 0) : null;
  const side = (team: string, home: boolean) => {
    const ppv = home ? pp?.home?.value : pp?.away?.value;
    const pkv = home ? pk?.home?.value : pk?.away?.value;
    const ppr = home ? pp?.home?.context?.rank : pp?.away?.context?.rank;
    const pkr = home ? pk?.home?.context?.rank : pk?.away?.context?.rank;
    const unit = pp1(team);
    return (
      <div className="nspt__team">
        <TeamChip abbr={team} size="md" name="nick" />
        <div className="nspt__nums">
          {ppv != null && <Stat glyph="powerPlay" label="Power play" value={<span className="num">{pct(ppv)}</span>} sub={ppr ? `#${ppr} of 32 · raw, season` : 'raw, season'} />}
          {pkv != null && <Stat glyph="penaltyKill" label="Penalty kill" value={<span className="num">{pct(pkv)}</span>} sub={pkr ? `#${pkr} of 32 · raw, season` : 'raw, season'} />}
          {p?.ppGoals && <Stat glyph="goal" label="PP goals" value={<span className="num">{(home ? p.ppGoals.home : p.ppGoals.away).toFixed(2)}</span>} sub="model expectation" />}
        </div>
        {unit.length > 0 && <p className="nspt__unit"><span>PP1</span>{unit.join(' · ')}</p>}
      </div>
    );
  };
  return (
    <Section id="n-special" title="Special teams" sub={st ? <>Special teams decide it in <b className="num">{pct(st.probability)}</b> of simulations{st.leagueBaseRate != null ? `, ${baseWord(st)}` : ''}.{ppShare != null ? ` Across all scripts ${pct(ppShare)} of goals come on the power play.` : ''}</> : 'Power-play and penalty-kill context.'}>
      <div className="nspt">
        {side(ids.away, false)}
        {side(ids.home, true)}
      </div>
      <p className="nsl__muted">PP% and PK% are raw season rates (not opponent-adjusted): context, never the reason for an edge.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ players

const FAMILY_SHORT: Record<string, string> = { player_points: 'pts', player_assists: 'ast', player_goals: 'goal', goalie_saves: 'saves' };

function PropChip({ mk, s, hv }: { mk: PlayerLine['markets'][number]; s: NhlScripts | null; hv: boolean }) {
  const label = mk.family === 'player_goals' ? (mk.threshold != null && mk.threshold > 0.5 ? `${Math.ceil(mk.threshold)}+ goals` : 'Goal') : `${mk.threshold != null ? `${Math.ceil(mk.threshold)}+ ` : ''}${FAMILY_SHORT[mk.family] ?? mk.family}`;
  const swing = s ? scriptSwing(s, mk.byScript) : null;
  return (
    <li className={`nprop${hv ? ' nprop--hv' : ''}`} title={swing ? `Best in ${swing.best.x.label} (${pct(swing.best.p)}), worst in ${swing.worst.x.label} (${pct(swing.worst.p)})` : undefined}>
      <span className="nprop__l"><Glyph name={familyGlyph(mk.family)} size={13} />{label}</span>
      <b className="num">{pct(mk.pYes)}</b>
      <span className="nprop__m">mkt {pct(mk.pMid)}</span>
      {mk.best && !hv && (mk.best.tier === 'ROBUST' || mk.best.tier === 'MODERATE') && <span className="nprop__b">{mk.best.side.toUpperCase()} <TierChip tier={mk.best.tier} /></span>}
    </li>
  );
}

function PlayerCard({ pl, s, slug, known }: { pl: PlayerLine; s: NhlScripts | null; slug: string; known: (id: string | null) => boolean }) {
  const main = pl.markets.filter((m) => m.family !== 'player_goals' && (m.family === 'goalie_saves' || (m.threshold ?? 0.5) <= 1.5));
  const goals = pl.markets.filter((m) => m.family === 'player_goals' && (m.threshold ?? 0.5) <= 0.5);
  const pts = pl.markets.find((m) => m.family === 'player_points' && (m.threshold ?? 0.5) <= 0.5);
  const swing = s && pts ? scriptSwing(s, pts.byScript) : null;
  return (
    <li className="npc">
      <div className="npc__h">
        <TeamChip abbr={pl.team} size="sm" />
        {pl.pid && known(pl.pid) ? <Link to={routes.player(slug, pl.pid)} className="npc__n">{pl.name}</Link> : <span className="npc__n">{pl.name}</span>}
        {pl.role && <span className="npc__role">{pl.role}</span>}
      </div>
      <ul className="npc__props">
        {main.map((mk) => <PropChip key={mk.ticker} mk={mk} s={s} hv={false} />)}
        {goals.map((mk) => <PropChip key={mk.ticker} mk={mk} s={s} hv />)}
      </ul>
      {swing && <p className="npc__why"><Glyph name={SCRIPT_GLYPH[swing.best.x.id] ?? 'puck'} size={13} />Point chance highest if {lowerLabel(swing.best.x.label)} ({pct(swing.best.p)}), lowest if {lowerLabel(swing.worst.x.label)} ({pct(swing.worst.p)}).</p>}
    </li>
  );
}

export function PlayerResearch({ players, s, ids, slug, known, limit, to }: { players: PlayerLine[]; s: NhlScripts | null; ids: SideIds; slug: string; known: (id: string | null) => boolean; limit?: number; to?: string }) {
  const [all, setAll] = useState(false);
  const skaters = players.filter((p) => !p.goalie);
  const n = limit && !all ? limit : 99;
  if (!skaters.length) {
    return (
      <Section id="n-players" title="Player research" sub="Points, assists and goal props the model prices.">
        <p className="nsl__muted">No player props are listed or priced for this game yet. They appear when Kalshi lists them and the model prices the game.</p>
      </Section>
    );
  }
  return (
    <Section id="n-players" title="Player research" sub={<>Model probability beside the market midpoint for each prop, with the script that moves it most. Goal-scorer props are <span className="nhv">high variance</span>.</>}
      actions={to ? <Link to={to} className="nlink">All players <Icon name="arrowRight" size={14} /></Link> : undefined}>
      <div className="npr">
        {[ids.away, ids.home].map((team) => {
          const rows = skaters.filter((p) => p.team === team);
          if (!rows.length) return null;
          return (
            <div key={team} className="npr__team">
              <h3 className="npr__th"><TeamChip abbr={team} size="md" name="nick" /></h3>
              <ol className="npr__l">{rows.slice(0, n).map((pl) => <PlayerCard key={pl.name} pl={pl} s={s} slug={slug} known={known} />)}</ol>
              {rows.length > n && !to && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAll(true)}>Show all {rows.length} {team} players</button>}
            </div>
          );
        })}
      </div>
      <p className="nsl__muted">Shots-on-goal props are not in the publication; Sift shows only markets the model prices.</p>
    </Section>
  );
}
