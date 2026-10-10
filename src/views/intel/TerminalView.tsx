// SIFT INTELLIGENCE TERMINAL — a dense research workspace over today's discoveries (src/intelligence/discoveries.ts).
// Desktop: the filterable Discovery Board on the left, the selected discovery's workspace in the centre, connected
// panels around it (price ladder, matchup strength, model evidence, same-game findings, method and source). Selecting
// a discovery updates every panel; a discovery can be pinned to keep it one tap away. Phones: the list, then a
// focused view of one discovery with a way back. Presets (Football Lab, Prop Lab, Market Lab) filter the board;
// the chosen preset and pins are remembered in this browser.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventResearchDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { sportByCode } from '../../data/sports';
import { navSport } from '../../data/nav';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { SaveButton, Skeleton } from '../../components/ui';
import { ago } from '../../lib/format';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { useVisit } from '../../state/trail';
import { buildDiscoveries, KIND_WORD, WORKSPACES, type Discovery, type DiscoveryKind, type Workspace } from '../../intelligence/discoveries';
import { DiscoveryCard } from '../broadcast/parts';
import { IntelNav } from './IntelNav';
import { MarketCompare } from './MarketCompare';

const PREF_KEY = 'sift.terminal.v1';
interface Prefs { ws: Workspace | 'all'; pins: string[] }
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Prefs | null;
    if (p && Array.isArray(p.pins)) return { ws: p.ws ?? 'all', pins: p.pins.slice(0, 12) };
  } catch { /* private mode or corrupt: defaults */ }
  return { ws: 'all', pins: [] };
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* not persisted */ }
}

/** NFL event research for the coming week's games (the matchup mismatches), read once and memoised. */
function useNflResearch(eventIds: string[]) {
  const key = eventIds.join(',');
  return useAsync(key ? `terminal:nfl:${key}` : null, async () => {
    const sport = sportByCode('NFL');
    if (!sport) return [] as EventResearchDoc[];
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return [];
    const out = await Promise.allSettled(eventIds.map((id) => repo.eventResearch(id)));
    return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
  });
}

const pctW = (v: number | null | undefined) => (v == null ? null : Math.max(0, Math.min(100, v * 100)));

/** Ask, break-even, the publication's fair probability and its bet-up-to on one 0–100¢ scale. */
function PriceLadder({ d }: { d: Discovery }) {
  const p = d.opportunity?.price;
  if (!p) return null;
  const marks = [
    { k: 'Ask', v: p.ask, cls: 'ask' },
    { k: 'Break-even', v: p.breakEven, cls: 'be' },
    { k: 'Publication fair', v: p.fair, cls: 'fair' },
    { k: 'Bet up to', v: p.betUpTo, cls: 'bu' },
  ].filter((m) => m.v != null);
  return (
    <section className="tpanel" aria-labelledby="tp-price">
      <h3 className="tpanel__h" id="tp-price"><Icon name="chart" size={15} /> Price vs fair</h3>
      <div className="pladder" role="img" aria-label={marks.map((m) => `${m.k} ${Math.round((m.v as number) * 100)} cents`).join(', ')}>
        <div className="pladder__track" />
        {p.fairLow != null && p.fairHigh != null && <div className="pladder__band" style={{ left: `${pctW(p.fairLow)}%`, width: `${(pctW(p.fairHigh)! - pctW(p.fairLow)!)}%` }} />}
        {marks.map((m) => <span key={m.k} className={`pladder__m pladder__m--${m.cls}`} style={{ left: `${pctW(m.v)}%` }}><i /><b>{Math.round((m.v as number) * 100)}¢</b></span>)}
      </div>
      <ul className="pladder__key">{marks.map((m) => <li key={m.k} className={`pladder__k--${m.cls}`}>{m.k}</li>)}</ul>
      <p className="tpanel__note">{p.state === 'CURRENT' ? 'Quote is current.' : `Price state: ${p.state.toLowerCase().replace(/_/g, ' ')}.`} {p.observedAt ? `Observed ${ago(p.observedAt)}.` : ''} A fair price above the break-even is the publication’s claim, not proof of value.</p>
    </section>
  );
}

/** The two units' league strength on one scale, tier-coloured and labelled with the rank. */
function MatchupStrength({ d }: { d: Discovery }) {
  const i = d.insight;
  if (!i) return null;
  const rows = [i.offense, i.defense];
  const tierCls = (t: string) => (t === 'elite' || t === 'strong' ? 'good' : t === 'average' ? 'mid' : 'bad');
  return (
    <section className="tpanel" aria-labelledby="tp-mm">
      <h3 className="tpanel__h" id="tp-mm"><Icon name="compare" size={15} /> Opponent-adjusted strength</h3>
      <ul className="mstr">
        {rows.map((u) => (
          <li key={u.metricId + u.team.abbr}>
            <span className="mstr__n">{u.team.nick} {u.unit}</span>
            <span className="mstr__bar"><span className={`mstr__fill mstr__fill--${tierCls(u.rank.tier)}`} style={{ width: `${Math.round(u.rank.strength * 100)}%` }} /></span>
            <span className={`tier tier--${tierCls(u.rank.tier)}`}>#{u.rank.rank} · {u.rank.tierWord}</span>
          </li>
        ))}
      </ul>
      <p className="tpanel__note">Bar = league percentile of the publication’s opponent-adjusted rating (right = better at the unit’s job).</p>
    </section>
  );
}

function ModelEvidence({ d }: { d: Discovery }) {
  const c = d.opportunity?.confidence;
  return (
    <section className="tpanel" aria-labelledby="tp-ev">
      <h3 className="tpanel__h" id="tp-ev"><Icon name="shield" size={15} /> Model evidence</h3>
      {c ? (
        <>
          <p className="tpanel__lead">{c.calibration === 'MARKET_BEATS_MODEL' ? 'The market has the better settled record for this model.' : c.calibration === 'VALIDATED' ? 'Validated by its publication.' : c.calibration === 'RESEARCH' ? 'Research model: calibration published, not promoted.' : 'No settled record published yet.'}</p>
          {c.note && <p className="tpanel__note">{c.note}</p>}
          {c.record && <p className={`tpanel__note${c.record.adverse ? ' is-adverse' : ''}`}>Track record: {c.record.line}</p>}
        </>
      ) : <p className="tpanel__note">A matchup or data finding: it carries no model price, so there is no model record to weigh.</p>}
      <Link to={routes.pulse(d.slug)} className="bsec__more">{navSport(d.slug)?.label ?? d.sport} in Model Pulse <Icon name="arrowRight" size={14} /></Link>
    </section>
  );
}

function Workspace({ d, all, pinned, onPin, onBack }: { d: Discovery; all: Discovery[]; pinned: boolean; onPin: () => void; onBack: () => void }) {
  const sameGame = all.filter((x) => x.eventId && x.eventId === d.eventId && x.id !== d.id).slice(0, 5);
  const nav = navSport(d.slug);
  const o = d.opportunity;
  return (
    <article className="tws" aria-labelledby="tws-t">
      <button type="button" className="btn btn--ghost btn--sm tws__back" onClick={onBack}><Icon name="arrowLeft" size={14} /> All discoveries</button>
      <header className="glass glass--lit tws__head">
        <span className="dcard__top"><span className="dcard__kind">{nav && <SportMark slug={d.slug} icon={nav.icon} size={14} />}{nav?.label} · {KIND_WORD[d.kind]}</span><span className={`dcard__sig dcard__sig--${d.significance}`}>{d.significance === 'high' ? 'High significance' : d.significance === 'medium' ? 'Notable' : 'Context'}</span></span>
        <h2 className="tws__t" id="tws-t">{d.title}</h2>
        <p className="tws__why">{d.why}</p>
        <div className="tws__ev">
          <span className="tws__evk">Betting evidence</span>
          {d.evidence ? <><span className={`dword dword--${d.evidence.tone}`}>{d.evidence.word}</span><span className="dcard__basis">{d.evidence.basis}</span></> : <span className="dcard__noev">None — significance is not a bet</span>}
        </div>
        <div className="tws__acts">
          {d.gameHref && <Link to={d.gameHref} className="btn btn--primary btn--sm">Open game <Icon name="arrowRight" size={14} /></Link>}
          {d.href && d.href !== d.gameHref && <Link to={d.href} className="btn btn--sm">{d.kind === 'market' ? 'Open market' : 'Open research'}</Link>}
          {o?.marketId && <SaveButton ref_kind="MARKET" sport={o.sport} id={o.marketId} extra={{ market_id: o.marketId, event_id: o.eventId }} label={{ label: `${o.what.side === 'NO' ? 'NO · ' : ''}${o.what.title}`, sub: o.eventLabel, href: o.href }} kickoff={o.startTime} />}
          <button type="button" className={`btn btn--sm${pinned ? ' is-on' : ''}`} aria-pressed={pinned} onClick={onPin}><Icon name="pin" size={14} /> {pinned ? 'Pinned' : 'Pin'}</button>
        </div>
      </header>
      <div className="tws__grid">
        <section className="tpanel tpanel--facts" aria-labelledby="tp-facts">
          <h3 className="tpanel__h" id="tp-facts"><Icon name="info" size={15} /> The numbers</h3>
          <dl className="tfacts">{d.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd className="bnum">{f.value}</dd></div>)}</dl>
        </section>
        <PriceLadder d={d} />
        <MatchupStrength d={d} />
        <ModelEvidence d={d} />
        {d.risk && (
          <section className="tpanel tpanel--risk" aria-labelledby="tp-risk">
            <h3 className="tpanel__h" id="tp-risk"><Icon name="flame" size={15} /> How this could be wrong</h3>
            <p className="tpanel__lead">{d.risk}</p>
            {o && o.evidence.length > 0 && <ul className="tpanel__list">{o.evidence.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>}
          </section>
        )}
        <section className="tpanel" aria-labelledby="tp-src">
          <h3 className="tpanel__h" id="tp-src"><Icon name="clock" size={15} /> Method & source</h3>
          <p className="tpanel__note">{d.method}</p>
          <p className="tpanel__note">Source: {d.source}{d.observedAt ? ` · observed ${ago(d.observedAt)}` : ''}</p>
        </section>
        {o && <div className="tpanel--wide"><MarketCompare key={d.id} opps={all.filter((x) => x.opportunity && x.eventId === d.eventId).map((x) => x.opportunity!)} title="Compare expressions on this game" /></div>}
        {sameGame.length > 0 && (
          <section className="tpanel tpanel--wide" aria-labelledby="tp-same">
            <h3 className="tpanel__h" id="tp-same"><Icon name="layers" size={15} /> Same game</h3>
            <ul className="tsame">{sameGame.map((x) => <li key={x.id}><Link to={routes.intelligence({ d: x.id })}>{x.title}</Link> <span className="muted">· {KIND_WORD[x.kind]}{x.evidence ? ` · ${x.evidence.word}` : ''}</span></li>)}</ul>
          </section>
        )}
      </div>
    </article>
  );
}

const KINDS: (DiscoveryKind | 'all')[] = ['all', 'mismatch', 'market', 'freshness'];

export function TerminalView() {
  useVisit('Intelligence Terminal', 'intel');
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const ws = (sp.get('ws') as Workspace | null) ?? prefs.ws;
  const sport = sp.get('sport');
  const kind = (sp.get('kind') as DiscoveryKind | null) ?? 'all';
  const selectedId = sp.get('d');
  const nflIds = useMemo(() => {
    const b = all.bundles.find((x) => x.sport.code === 'NFL');
    return (b?.board ?? []).filter((i) => Date.parse(i.start_time_utc) > now - 3 * 3600_000 && Date.parse(i.start_time_utc) < now + 8 * 86_400_000).map((i) => i.event_id).sort();
  }, [all.bundles, now]);
  const nfl = useNflResearch(nflIds);
  const discoveries = useMemo(() => buildDiscoveries({ opportunities: all.opportunities, verdicts: all.verdicts, research: (nfl.data ?? []).map((r) => ({ r, slug: 'nfl' })), now }), [all.opportunities, all.verdicts, nfl.data, now]);
  const shown = discoveries.filter((d) => (ws === 'all' || d.workspaces.includes(ws)) && (!sport || d.slug === sport) && (kind === 'all' || d.kind === kind));
  const selected = discoveries.find((d) => d.id === selectedId) ?? (selectedId ? null : shown[0] ?? null);
  const set = (k: string, v: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: k !== 'd' });
  const setWs = (w: Workspace | 'all') => { setPrefs((p) => ({ ...p, ws: w })); set('ws', w === 'all' ? null : w); };
  const togglePin = (id: string) => setPrefs((p) => ({ ...p, pins: p.pins.includes(id) ? p.pins.filter((x) => x !== id) : [id, ...p.pins].slice(0, 12) }));
  const pinned = prefs.pins.map((id) => discoveries.find((d) => d.id === id)).filter((d): d is Discovery => !!d);
  const sports = [...new Set(discoveries.map((d) => d.slug))];
  const loading = all.loading || (nflIds.length > 0 && nfl.loading && !nfl.data);
  return (
    <div className={`page term${selectedId ? ' term--focused' : ''}`}>
      <IntelNav />
      <header className="bhome__mast">
        <div>
          <span className="eyebrow2">SIFT Intelligence</span>
          <h1 className="bhome__h">Terminal</h1>
        </div>
        <p className="bhome__sum"><b className="bnum">{discoveries.length}</b> discoveries today · significance and betting evidence are rated separately</p>
      </header>
      <div className="term__presets">
        <div className="gtabs2" role="group" aria-label="Workspace">
          <button type="button" className={`gtab${ws === 'all' ? ' is-on' : ''}`} aria-pressed={ws === 'all'} onClick={() => setWs('all')}>All discoveries</button>
          {WORKSPACES.map((w) => <button key={w.id} type="button" className={`gtab${ws === w.id ? ' is-on' : ''}`} aria-pressed={ws === w.id} onClick={() => setWs(w.id)} title={w.sub}>{w.label}</button>)}
        </div>
      </div>
      {pinned.length > 0 && (
        <div className="term__pins" role="group" aria-label="Pinned discoveries">
          <span className="eyebrow2"><Icon name="pin" size={12} /> Pinned</span>
          {pinned.map((p) => <button key={p.id} type="button" className={`term__pin${selected?.id === p.id ? ' is-on' : ''}`} onClick={() => set('d', p.id)}>{p.title}</button>)}
        </div>
      )}
      <div className="term__grid">
        <aside className="term__board" aria-label="Discovery Board">
          <div className="term__filters">
            <label className="term__sel"><span>Sport</span>
              <select value={sport ?? ''} onChange={(e) => set('sport', e.target.value || null)}>
                <option value="">All sports</option>
                {sports.map((s) => <option key={s} value={s}>{navSport(s)?.label ?? s}</option>)}
              </select>
            </label>
            <label className="term__sel"><span>Kind</span>
              <select value={kind} onChange={(e) => set('kind', e.target.value === 'all' ? null : e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k === 'all' ? 'All kinds' : KIND_WORD[k]}</option>)}
              </select>
            </label>
          </div>
          {loading && !discoveries.length ? <Skeleton lines={6} /> : shown.length ? (
            <ol className="term__list">{shown.slice(0, 80).map((d) => <li key={d.id}><DiscoveryCard d={d} active={selected?.id === d.id} onSelect={() => set('d', d.id)} /></li>)}</ol>
          ) : <div className="bempty"><h3>No discoveries match</h3><p>Change the workspace or filters. An empty board is an honest result on a quiet day.</p></div>}
          {nfl.loading && <p className="muted term__loading">Reading NFL matchup research…</p>}
        </aside>
        <div className="term__main">
          {selected ? <Workspace d={selected} all={discoveries} pinned={prefs.pins.includes(selected.id)} onPin={() => togglePin(selected.id)} onBack={() => set('d', null)} /> : selectedId && !loading ? (
            <div className="bempty"><h3>That discovery is no longer on the board</h3><p>It may have expired, started, or been repriced away. <button type="button" className="linkbtn" onClick={() => set('d', null)}>Back to today’s discoveries</button></p></div>
          ) : <Skeleton lines={8} tall />}
        </div>
      </div>
    </div>
  );
}
