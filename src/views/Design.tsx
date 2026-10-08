// The living reference for the Sift design system (docs/DESIGN_SYSTEM.md describes the rules).
import { Icon, SiftMark } from '../components/Icon';
import { ContextMeter, EntityLink, FreshnessChip, QualityBadge, RankPill, Stratum, TeamMark } from '../components/ui';
import { useVisit } from '../state/trail';

const SWATCHES: [string, string][] = [
  ['--black', 'page · near-black'], ['--slate', 'panel'], ['--deep-blue', 'selected surface'], ['--blue', 'navigation state'],
  ['--gold', 'gold · price + action'], ['--ice', 'cyan · signal'], ['--teal', 'teal · coverage'], ['--ivory', 'ivory · text'], ['--script-1', 'script: fav 14+'], ['--script-2', 'script: fav 7–13'], ['--script-3', 'script: one score'], ['--script-4', 'script: dog 7+'],
  ['--mark-focus', 'chart: viewing'], ['--mark-opp', 'chart: opponent'], ['--mark-compare', 'chart: pinned'], ['--mark-context', 'chart: context'],
  ['--fresh', 'FRESH'], ['--aging', 'AGING'], ['--stale', 'STALE'], ['--q-research', 'RESEARCH'],
];

export function DesignView() {
  useVisit('Design system', 'status');
  const now = Date.now();
  const iso = (mins: number) => new Date(now - mins * 60000).toISOString();
  return (
    <div className="page design">
      <header className="pagehead">
        <div className="eyebrow">Design system</div>
        <h1 className="h-display">Night stadium</h1>
        <p className="lede">A near-black page, dark navy panels raised by blue hairlines, vivid gold, cyan and script colours — sampled from the approved mockup. Examples below use illustrative inputs to show the components — they are not sports data.</p>
      </header>
      <Stratum n="01" title="Color">
        <ul className="swatches">
          {SWATCHES.map(([v, l]) => (
            <li key={v}><span className="swatch" style={{ background: `var(${v})` }} /><code>{v}</code><span className="muted small">{l}</span></li>
          ))}
        </ul>
      </Stratum>
      <Stratum n="02" title="Type">
        <div className="typescale">
          <div className="h-display">Display · Barlow 600</div>
          <div className="h-display h-display--md">Entity header</div>
          <p>Interface · Barlow 400–500: navigation, tabs, panel titles, labels and body.</p>
          <p className="num">Numbers · Barlow, tabular figures · +0.134 · #27 · 73.5¢</p>
          <div className="eyebrow">Eyebrow · section context</div>
        </div>
      </Stratum>
      <Stratum n="03" title="States">
        <div className="chips">
          <FreshnessChip asOf={iso(4)} label="fresh" />
          <FreshnessChip asOf={iso(40)} label="aging" />
          <FreshnessChip asOf={iso(300)} label="stale" />
          <FreshnessChip asOf={null} label="unknown" />
        </div>
        <div className="chips">
          {['VERIFIED', 'PARTIAL', 'RESEARCH', 'UNAVAILABLE'].map((s) => <QualityBadge key={s} status={s} />)}
        </div>
      </Stratum>
      <Stratum n="04" title="Entities, ranks, context">
        <div className="chips">
          <EntityLink to="/design" kind="team">Team</EntityLink>
          <EntityLink to="/design" kind="player">Player</EntityLink>
          <EntityLink to="/design" kind="game">Game</EntityLink>
          <EntityLink to="/design" kind="metric">Metric</EntityLink>
          <EntityLink to="/design" kind="ranking">Ranking</EntityLink>
          <EntityLink to="/design" kind="market">Market</EntityLink>
          <TeamMark sport="NFL" abbr="BUF" /> <TeamMark sport="NFL" abbr="BAL" />
        </div>
        <div className="chips">
          <RankPill rank={2} size={32} hib /> <RankPill rank={16} size={32} hib /> <RankPill rank={30} size={32} hib />
        </div>
        <div style={{ maxWidth: 320 }}>
          <ContextMeter value={0.2} ctx={{ rank: 8, universe_size: 32, percentile: 78, ranking_id: null, universe_label: null, league_average: 0, league_median: -0.01, best_value: 1, worst_value: -1, best_entity_id: null, worst_entity_id: null, higher_is_better: true }} oppValue={-0.5} />
        </div>
      </Stratum>
      <Stratum n="05" title="Actions">
        <div className="chips">
          <button type="button" className="btn btn--primary"><Icon name="arrowRight" size={16} /> Primary</button>
          <button type="button" className="btn btn--ghost">Ghost</button>
          <button type="button" className="btn btn--copy"><Icon name="copy" size={18} /> COPY FOR CHATGPT</button>
          <SiftMark size={32} />
        </div>
      </Stratum>
    </div>
  );
}
