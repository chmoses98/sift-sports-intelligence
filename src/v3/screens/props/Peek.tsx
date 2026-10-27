// PD3: the peek. One tap on a row expands it in place: the last games against the rung, the three lanes (Market, History, SIFT model, in
// that order and never blended), a plain reason when the model is withheld, the neighbouring rungs, the opponent unit on its
// worst-to-best track, and the actions. A rung chip changes the line in place; nothing here leaves the list until a target is tapped.
import { useEffect, useRef } from 'react';
import { historyStateOf, type PriceReader } from '../../data/props/hooks';
import { hitCount } from '../../data/props/history';
import { modelPercent } from '../../data/props/model';
import { refToken, rungFor } from '../../data/props/query';
import type { BankEntry } from '../../data/props/bank';
import type { Matchup, Prop } from '../../data/props/types';
import { findSaved } from '../../model/saved';
import { routes } from '../../nav/routes';
import { PlayerLink, PriceTap, StatLink } from '../../nav/Targets';
import { removeSaved, saveResearch, useSaved } from '../../state/prefs';
import { ordinal } from '../../../lib/format';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import { firstName, gameText, HitBars, Mark, oppTeam, playerRef, playerState, statText, UnitTrack } from './parts';

export interface PeekBits { reader: PriceReader; get: (key: string) => BankEntry | undefined }

/** The research this prop saves: Player Research with this statistic and line when the player has a page, else the list filtered to him. */
export function propSaveRoute(p: Prop, k: number): string {
  const ref = playerRef(p);
  return ref ? routes.player(ref, playerState(p, k) ?? {}) : routes.props({ view: 'list', ...(p.playerId ? { player: p.playerId } : { q: p.name }), exp: refToken(p, k) });
}

export function SaveProp({ p, k, className }: { p: Prop; k: number; className?: string }) {
  const list = useSaved();
  const route = propSaveRoute(p, k);
  const rec = findSaved(list, route);
  const toggle = () => {
    if (rec) { removeSaved(rec.id); return; }
    saveResearch({ title: `${p.name} · ${p.abbr} ${k}+`, subtitle: gameText(p), route, chips: [`${p.abbr} ${k}+`, p.sportLabel], kind: playerRef(p) ? 'player' : 'props', sport: p.slug });
  };
  return <button type="button" className={className ?? 'pd-abtn pd-abtn--sq'} aria-pressed={!!rec} aria-label={rec ? `Remove ${p.name} ${statText(p, k)} from saved research` : `Save ${p.name} ${statText(p, k)} to saved research`} onClick={toggle}><Icon name="bookmark" size={18} fill={!!rec} /></button>;
}

export function Peek({ p, k, m, bits, onRung }: { p: Prop; k: number; m: Matchup | null; bits: PeekBits; onRung: (k: number) => void }) {
  const r = rungFor(p, k);
  const price = bits.reader.priceOf(p, r);
  const hs = historyStateOf(p, bits.get);
  const hit = hs.state === 'ready' ? hitCount(hs.values, r.k) : null;
  const model = modelPercent(p.model, r.k);
  const ref = playerRef(p);
  const opp = oppTeam(p);
  const strip = useRef<HTMLDivElement>(null);
  // Keep the chosen rung in view inside its own strip (never scrolls the page).
  useEffect(() => {
    const el = strip.current, on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && on) el.scrollLeft = Math.max(0, on.offsetLeft - el.clientWidth / 2 + on.clientWidth / 2);
  }, [r.k]);

  const marketCell = (
    <>
      <span className="t pd-m"><Mark lane="m" />Market</span>
      <span className={`n pd-m${price ? '' : ' is-none'}`}>{price?.ask != null ? `${price.ask}%` : '—'}</span>
      <span className="s">{price?.ask != null ? `${price.ask}¢ ask · pre-fee` : 'pre-fee ask'}</span>
    </>
  );
  const histCell = (
    <>
      <span className="t pd-hc"><Mark lane="h" />History</span>
      <span className={`n pd-hc${hit ? '' : ' is-none'}`}>{hit ? `${Math.round((100 * hit.h) / hit.n)}%` : hs.state === 'loading' || hs.state === 'idle' ? '…' : '—'}</span>
      <span className="s">{hit ? `${hit.h} of ${hit.n} · observed` : hs.state === 'loading' || hs.state === 'idle' ? 'loading the game log' : 'not published'}</span>
    </>
  );
  const published = p.model.state === 'published';
  const sub = model != null ? `P(${r.k}+) published` : published ? 'not published at this rung' : 'not approved yet';

  return (
    <div className="pd-peek" data-peek={p.id}>
      {(p.availPending || p.out) && (
        <div className="pd-whyno" role="status" data-avail={p.availPending ? 'pending' : 'out'}>
          <Icon name="info" size={13} />
          <span>{p.availPending ? 'Checking availability: the game’s injury report has not been read yet.' : `The publication lists ${p.name} as ${p.out}.`}</span>
        </div>
      )}
      <div className="pd-pk1">
        {hs.state === 'ready' && hit ? (
          <>
            <div className="pd-pkh"><b>Last {hs.values.length} games · {p.label.toLowerCase()}</b><span>{hit.h} of {hit.n} cleared {r.k}+</span></div>
            <HitBars values={hs.values.slice(-10)} k={r.k} label={`${p.name}, last ${hs.values.length} games, ${hit.h} of ${hit.n} cleared ${r.k} plus ${p.label.toLowerCase()}`} />
          </>
        ) : hs.state === 'loading' || hs.state === 'idle' ? (
          <div className="v3-skel" style={{ height: 112 }} role="status" aria-label="Loading the game log" />
        ) : (
          <div className="pd-whyno"><Icon name="lock" size={13} /><span>No game log is published for this player in this sport yet.</span></div>
        )}
      </div>

      <div className="pd-trio" role="group" aria-label="Evidence lanes">
        <PriceTap ticker={r.ticker} className="pd-lane" label={`Market lane: ${price?.ask != null ? `${price.ask} percent` : 'no price'}. Open the exact contract`}>{marketCell}</PriceTap>
        {ref ? <PlayerLink player={ref} state={playerState(p, r.k)} className="pd-lane" label={`History lane: ${hit ? `${hit.h} of ${hit.n}` : 'not available'}. Open Player Research`}>{histCell}</PlayerLink> : <div>{histCell}</div>}
        <div>
          <span className="t pd-z"><Mark lane="z" />SIFT model</span>
          <span className={`n pd-z${model != null ? '' : ' is-none'}`}>{model != null ? `${model}%` : '—'}</span>
          <span className="s">{sub}</span>
        </div>
      </div>

      {p.model.state === 'none' && <div className="pd-whyno"><Icon name="lock" size={13} /><span>{p.model.reason}. Shown as “—”, never estimated.</span></div>}

      <div className="pd-rsteps" ref={strip} role="group" aria-label="Rungs">
        <span className="x-eyebrow">Rungs</span>
        {p.rungs.map((x) => {
          const px = bits.reader.priceOf(p, x);
          return <button key={x.k} type="button" className="pd-rs" aria-pressed={x.k === r.k} aria-label={`${x.k} plus, ${px?.ask != null ? `${px.ask} cents` : 'no price'}`} onClick={() => onRung(x.k)}><b>{x.k}+</b><small>{px?.ask != null ? `${px.ask}¢` : '—'}</small></button>;
        })}
      </div>

      {m && (
        <StatLink stat={{ slug: p.slug, statId: m.statId }} state={{ win: m.window, sel: m.oppCode, opp: m.selfCode ?? undefined }} className="pd-umu" label={`${m.text}. Open the ranking`}>
          <div className="pd-slh"><span>{opp ? <TeamLogo team={opp} size={16} /> : null}{m.oppCode} {p.oppUnit?.long ?? 'unit'}</span><b>{ordinal(m.rank)} of {m.n}{m.value != null && p.oppUnit?.perGame ? ` · ${m.value.toFixed(1)}/game` : ''}</b></div>
          <UnitTrack m={m} opp={opp} />
        </StatLink>
      )}

      <div className="pd-acts">
        {ref && <PlayerLink player={ref} state={playerState(p, r.k)} className="pd-abtn pd-abtn--pri">Research {firstName(p.name)}</PlayerLink>}
        <PriceTap ticker={r.ticker} className={`pd-abtn${ref ? '' : ' pd-abtn--pri'}`} label={`Exact contract, ${statText(p, r.k)}`}>Contract{price?.ask != null ? ` · ${price.ask}¢` : ''}</PriceTap>
        <SaveProp p={p} k={r.k} />
      </div>
    </div>
  );
}
