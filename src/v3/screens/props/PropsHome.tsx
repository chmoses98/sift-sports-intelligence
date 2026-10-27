// PD1: discover. A title with today's real universe, a search field, the sport rail and the stat chips (all with live counts), and shelves
// curated by RULES, never by an edge score: SIFT model published (nearest a coin flip first) and Facing a bottom-3 defense. Each card
// carries the three lanes, the opponent unit chip and the ask; the lanes block opens the prop expanded in the list.
import { useMemo, type ReactNode } from 'react';
import { Link } from '../../../routing';
import { useHistoryBank } from '../../data/props/bank';
import { historyStateOf, ranksPending, useEnsureAvailability, useEnsureRanks, usePropPrices, useQueryCtx, useVisibleHistory, type UniverseState } from '../../data/props/hooks';
import { useBankVersion } from '../../data/props/lazyBank';
import { railCounts, shelfBottom3, shelfModel } from '../../data/props/query';
import { rankBank, rankKeysFor, type ChipState } from '../../data/props/ranks';
import type { Prop } from '../../data/props/types';
import type { Price } from '../../model/types';
import { useNow } from '../../../live/hooks';
import { routes } from '../../nav/routes';
import { PropsLink } from '../../nav/Targets';
import { Icon } from '../../ui/Icon';
import { usePublishContracts } from './contracts';
import { HorizonBar } from './HorizonBar';
import { Avatar, lanesFor, Mark, NameLine, OppChip, PricePill, type Lanes } from './parts';
import { rungFor } from '../../data/props/query';

/** `routes.props` plus a one-shot instruction the list consumes and removes (focus the search field, open the filter sheet). */
export function withOnce(route: string, key: 'focus' | 'filters'): string {
  const [path, query = ''] = route.split('?');
  const q = new URLSearchParams(query);
  q.set(key, '1');
  return `${path}?${q}`;
}

const dayWord = (ms: number) => {
  const d = new Date(ms);
  const wd = d.toLocaleDateString(undefined, { weekday: 'short' }), mo = d.toLocaleDateString(undefined, { month: 'short' });
  return `${wd} ${mo} ${d.getDate()}`;
};

function Card({ p, lanes, price, chip }: { p: Prop; lanes: Lanes; price: Price | null; chip: ChipState }) {
  const r = rungFor(p, null);
  const open = { view: 'list' as const, exp: p.id, pin: true };
  return (
    <article className="pd-card" data-prop={p.id}>
      <div className="pd-card__top">
        <Avatar p={p} size={38} k={r.k} />
        <div className="pd-card__who"><NameLine p={p} k={r.k} /></div>
        <PricePill p={p} r={r} price={price} />
      </div>
      <PropsLink state={open} className="pd-card__stat" label={`${p.name}, ${p.label} ${r.k}+. Open in the list`}>{p.label} <b>{r.k}+</b></PropsLink>
      <PropsLink state={open} className="pd-lanesL" label={`${p.name}: Market ${lanes.market ?? 'no price'}, History ${lanes.hist ? `${lanes.hist.h} of ${lanes.hist.n}` : 'not available'}, SIFT model ${lanes.model ?? 'not approved'}. Open the prop in the list`}>
        <div className="pd-m"><span className="t"><Mark lane="m" />Market</span><b className="num">{lanes.market != null ? `${lanes.market}%` : '—'}</b></div>
        <div className={`pd-hc${lanes.hist ? '' : ' is-none'}`}><span className="t"><Mark lane="h" />History</span><b className="num">{lanes.hist ? `${lanes.hist.h}/${lanes.hist.n}` : lanes.histState === 'loading' || lanes.histState === 'idle' ? '…' : '—'}</b></div>
        <div className={`pd-z${lanes.model != null ? '' : ' is-none'}`}><span className="t"><Mark lane="z" />SIFT model</span><b className="num">{lanes.model != null ? `${lanes.model}%` : '—'}</b></div>
      </PropsLink>
      <div className="pd-card__chip"><OppChip m={chip.state === 'ready' ? chip.m : null} loading={chip.state === 'loading'} p={p} /></div>
    </article>
  );
}

function Shelf({ title, sub, preset, rows, empty, cardOf }: { title: string; sub: string; preset: string; rows: Prop[]; empty?: string; cardOf: (p: Prop) => ReactNode }) {
  return (
    <section className="pd-shelf" aria-label={title}>
      <div className="pd-shelf__h">
        <div><h2>{title}</h2><small>{sub}</small></div>
        {rows.length > 0 && <PropsLink state={{ view: 'list', preset }} className="pd-seeall" label={`See all: ${title}`}>See all<Icon name="chevR" size={14} /></PropsLink>}
      </div>
      {rows.length > 0 ? <div className="pd-hs">{rows.map(cardOf)}</div> : <p className="pd-note" style={{ paddingTop: 10 }}>{empty}</p>}
    </section>
  );
}

export function PropsHome({ us, onHorizon }: { us: UniverseState; onHorizon: (h: UniverseState['horizon']) => void }) {
  const universe = us.universe!;
  const now = useNow(60_000);
  const bank = useHistoryBank();
  const { ctx, chipOf } = useQueryCtx(universe);
  useBankVersion(rankBank);
  const rail = useMemo(() => railCounts(universe.props), [universe]);
  const model = useMemo(() => shelfModel(universe.props), [universe]);
  const bottom = useMemo(() => shelfBottom3(universe.props, ctx.matchup), [universe, ctx]);
  const cards = useMemo(() => [...model.rows, ...bottom.rows], [model, bottom]);
  useVisibleHistory(cards);
  // The shelves' cards need their games' availability (a card for a player listed out is replaced by the next candidate) and the bottom-3
  // shelf needs every opponent ranking; the model shelf's candidates are read a few deep so a card that turns out to be out has a successor ready.
  const spare = useMemo(() => shelfModel(universe.props, 10).rows, [universe]);
  useEnsureAvailability(useMemo(() => [...spare, ...cards], [spare, cards]));
  useEnsureRanks(universe.props);
  const ranksWait = ranksPending(rankKeysFor(universe.props));
  const reader = usePropPrices(cards, null);
  usePublishContracts(cards, bank.get, bank.getVersion());
  const cardOf = (p: Prop) => {
    const r = rungFor(p, null);
    const price = reader.priceOf(p, r);
    return <Card key={p.id} p={p} price={price} lanes={lanesFor(p, r.k, price, historyStateOf(p, bank.get))} chip={chipOf(p)} />;
  };
  const s = universe.stats;
  return (
    <div className="pd pd-home" data-view="home">
      <header className="pd-h">
        <div className="pd-h__tt">
          <h1>Props</h1>
          <span className="pd-h__tr"><Link to={withOnce(routes.props({ view: 'list' }), 'filters')} className="v3-iconbtn" aria-label="Sort and filter" data-tap="props"><Icon name="sliders" size={22} /></Link></span>
        </div>
        <div className="pd-h__sub">{dayWord(now)} · {s.games} game{s.games === 1 ? '' : 's'}{universe.complete ? '' : ' so far'} · {s.props} props · {s.contracts} contracts</div>
      </header>
      <Link to={withOnce(routes.props({ view: 'list' }), 'focus')} className="pd-field" aria-label="Search player, stat or team" data-tap="props"><Icon name="search" size={20} /><span>Search player, stat or team</span></Link>
      <HorizonBar state={us} onChange={onHorizon} />
      <nav className="pd-rail" aria-label="Sport">
        <PropsLink state={{ view: 'list' }} className="is-on" label={`All sports, ${s.props} props`}>All <b>{s.props}</b></PropsLink>
        {rail.sports.map((x) => <PropsLink key={x.slug} state={{ view: 'list', sport: x.slug }} label={`${x.label}, ${x.n} props`}>{x.label} <b>{x.n}</b></PropsLink>)}
      </nav>
      <nav className="pd-fams" aria-label="Statistic">
        {rail.fams.map((x) => <PropsLink key={x.fam} state={{ view: 'list', fam: x.fam }} label={`${x.label}, ${x.n} props`}>{x.label} <b>{x.n}</b></PropsLink>)}
      </nav>
      <Shelf title="SIFT model published" sub={`${model.total} of ${s.props} props today${model.scope ? ` · ${model.scope}` : ''}`} preset="model" rows={model.rows} cardOf={cardOf}
        empty="No approved SIFT model estimate is published for any prop today. The lane shows “—” and says why." />
      {ranksWait ? (
        <section className="pd-shelf" aria-label="Facing a bottom-3 defense"><div className="pd-shelf__h"><div><h2>Facing a bottom-3 defense</h2><small>Reading opponent rankings…</small></div></div><div className="pd-skel" role="status" aria-label="Reading opponent rankings" style={{ padding: '10px 16px 0' }}><div className="v3-skel" style={{ height: 150 }} /></div></section>
      ) : bottom.total > 0 && <Shelf title="Facing a bottom-3 defense" sub={`${bottom.total} props · near-even prices first`} preset="bottom3" rows={bottom.rows} cardOf={cardOf} empty="No prop is priced near even against a bottom-3 unit right now." />}
      {universe.unreadable.length > 0 && <p className="pd-note" style={{ paddingTop: 14 }}><Icon name="info" size={13} /><span>No player props could be read for {universe.unreadable.join(', ')}.</span></p>}
    </div>
  );
}
