// Matchup quality (src/v3/model/matchupQuality.ts): one headline number and four mini bars, one tap opens the detail behind each bar.
// Every bar is a published input or the plain words for why it is missing ("Not enough data"); the headline needs at least two of the four.
import { useMemo, useState } from 'react';
import { rankFor } from '../../../history/stats';
import { COMPONENT_ORDER, MIN_COMPONENTS, qualityFor, type Input, type MatchupQuality, type QualityComponent, type UnitInput } from '../../model/matchupQuality';
import type { OppProfile } from '../../data/useOppUnits';
import { Icon } from '../../ui/Icon';
import type { PlayerView } from './view';

/** The quality for the player's selected statistic against the coming opponent, from his log, his position ranking and the opponent's published unit ranks. */
export function useMatchupQuality(v: PlayerView, profile: OppProfile): MatchupQuality | null {
  const vm = v.vm;
  const stat = v.stat;
  return useMemo(() => {
    if (!vm || !stat || !v.statDef) return null;
    const r = vm.rankDoc ? rankFor(vm.rankDoc, stat, vm.nextWeek) : null;
    const units: Input<UnitInput[]> = profile.loading ? { missing: 'the opponent’s unit ranks are still loading' }
      : profile.shown.length ? profile.shown.map((u) => ({ label: u.label, rank: u.obs.rank, n: u.obs.n, sample: u.obs.sample ?? profile.oppGames ?? null }))
      : { missing: profile.why ?? 'no opposing-unit rank is published' };
    return qualityFor({
      sport: vm.sport, stat, statLabel: v.statDef.label, obs: vm.obs, season: vm.season,
      rank: r ? { rank: r.rank, of: r.of, games: r.games, position: r.position, season: r.season } : null, units,
    });
  }, [vm, stat, v.statDef, profile]);
}

const band = (s: number) => (s >= 65 ? 'hi' : s <= 35 ? 'lo' : 'mid');

function Bar({ c }: { c: QualityComponent }) {
  return (
    <span className="v3p-mq__row" data-mq={c.id} data-score={c.score ?? 'none'}>
      <span className="v3p-mq__lab">{c.label}</span>
      <i className={`v3p-mq__bar${c.score == null ? ' is-none' : ''}`} aria-hidden="true">
        {c.score != null && <u className={`is-${band(c.score)}`} style={{ width: `${c.score}%` }} />}
        <s />
      </i>
      <b className="num v3p-mq__val">{c.score != null ? Math.round(c.score) : '—'}</b>
    </span>
  );
}

function Detail({ c }: { c: QualityComponent }) {
  return (
    <div className="v3p-mq__d" data-mq-detail={c.id}>
      <div className="v3p-mq__dh"><b>{c.label}</b><span>weight {Math.round(c.weight * 100)}%</span></div>
      {c.score != null ? (
        <>
          <p>{c.detail}</p>
          <p className="v3p-mq__sub">raw {Math.round(c.raw!)} → {Math.round(c.score)} after shrinking toward 50 · sample {c.n} · counts {Math.round(c.reliability! * 100)}%</p>
        </>
      ) : <p className="v3p-mq__none">Not enough data: {c.why}</p>}
    </div>
  );
}

export function MatchupQualityCard({ q }: { q: MatchupQuality }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(q.components.map((c) => [c.id, c]));
  return (
    <section className="v3p-sec v3p-card v3p-mq" aria-label="Matchup quality" data-mq-score={q.score ?? 'none'}>
      <div className="v3p-sh"><h2>Matchup quality</h2><span className="v3p-chip is-cy">{q.available} of 4 inputs</span></div>
      <button type="button" className="v3p-mq__btn" aria-expanded={open} aria-controls="v3p-mq-detail" onClick={() => setOpen((o) => !o)}>
        <span className="v3p-mq__top">
          {q.score != null ? <><b className="num v3p-mq__big">{q.score}</b><span className="v3p-mq__word">{q.word}</span><span className="v3p-mq__of">of 100</span></>
            : <><b className="num v3p-mq__big is-none">—</b><span className="v3p-mq__word">Not enough data</span></>}
          <span className="v3p-mq__tog">{open ? 'Hide why' : 'Why'}<Icon name="back" size={14} style={{ transform: `rotate(${open ? 90 : -90}deg)` }} /></span>
        </span>
        {COMPONENT_ORDER.map((id) => <Bar key={id} c={byId.get(id)!} />)}
      </button>
      {open && (
        <div id="v3p-mq-detail" className="v3p-mq__dd">
          {q.score == null && <p className="v3p-mq__none">Needs at least {MIN_COMPONENTS} of 4 inputs; {q.available} published.</p>}
          {COMPONENT_ORDER.map((id) => <Detail key={id} c={byId.get(id)!} />)}
          <p className="v3p-foot">Weights are fixed editorial priors, not fitted. 50 is neutral; small samples are shrunk toward it. Describes the setup, not a probability or a bet.</p>
        </div>
      )}
    </section>
  );
}
