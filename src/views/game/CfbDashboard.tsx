// The CFB game dashboard cards (approved reference 02, adapted to what the CFB Script Engine publishes):
//  - Game scripts are RANKED EVIDENCE: each card carries its role (Primary, Secondary, Alternate, Danger) and archetype,
//    never a probability or a share — the engine publishes none. The card is titled "Ranked Game Scripts" so it never
//    reads as a likelihood; the full V1 "Likely Game Scripts" panel stays in the Deep Dive.
//  - Key Matchup Advantages draw the engine's own opponent-adjusted FBS ranks for each offense against the defense it
//    faces (matchup_profile.dimensions → the metric rows they cite). A trimmed event gets those from its verified
//    research sidecar (engine.detail): while it loads, or when it cannot be restored, the card says so in one line
//    (the page's detail notice carries the full reason) instead of drawing bars it does not have.
// Text stays short on purpose (the CFB overview's visible-word budget): the detail is one tap away.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { FxCard, VsBar } from '../../components/fx';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { ARCHETYPE_WORD, DIMENSION_WORD, EDGE_DIMENSIONS, ROLE_INDEX, ROLE_WORD, metricAt, scriptTitle, type Engine } from '../../lib/scriptEngine';
import { teamColors } from '../../lib/teams';

export function CfbScriptsCard({ engine, codes, scriptHref, allHref }: { engine: Engine; codes: { home: string; away: string }; scriptHref: (id: string) => string; allHref: string }) {
  return (
    <FxCard title="Ranked Game Scripts" icon="play" className="gdash__scripts gdash__scripts--cfb fx-span-7" id="gd-cfb-scripts" action={{ to: allHref, label: 'All scripts' }}>
      {engine.scripts.length ? (
        <ul className="gscr" aria-label="Game scripts ranked by evidence">
          {engine.scripts.map((s) => {
            const lead = s.lead_side ? codes[s.lead_side] : null;
            return (
              <li key={s.script_id} className={`gscr__i gscr__i--s${ROLE_INDEX[s.role]}`}>
                <Link to={scriptHref(s.script_id)} className="gscr__a" aria-label={`${ROLE_WORD[s.role]} script, ranked ${s.rank}: ${scriptTitle(s)} (${ARCHETYPE_WORD[s.archetype] ?? s.archetype}). ${s.summary}`}>
                  {lead && <span className="gscr__logo" aria-hidden="true" style={{ ['--tc' as string]: teamColors('CFB', lead)[0] }}><TeamMark sport="CFB" abbr={lead} size="xl" /></span>}
                  <span className="gscr__shade" aria-hidden="true" />
                  <span className="gscr__body" aria-hidden="true">
                    <span className="gscr__role">{ROLE_WORD[s.role]}</span>
                    <span className="gscr__n">{scriptTitle(s)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">No script cleared its evidence requirement, so none is shown.</p>}
      <p className="gdash__fine">Ranked by evidence · no likelihoods published.</p>
    </FxCard>
  );
}

interface CfbVsRow { key: string; d: string; off: 'home' | 'away'; o: { rank: number | null; of: number | null }; df: { rank: number | null; of: number | null }; edge: number; metric: string }

/** The engine's matchup dimensions as rank-vs-rank rows, the largest published edges first. */
export function cfbVsRows(engine: Engine): CfbVsRow[] {
  const out: CfbVsRow[] = [];
  for (const d of EDGE_DIMENSIONS) {
    const dim = engine.dimensions[d];
    for (const [off, dir] of [['home', dim?.home_offense_vs_away_defense], ['away', dim?.away_offense_vs_home_defense]] as const) {
      if (!dir || dir.edge == null || !dir.components?.length) continue;
      const c = dir.components.find((x) => x.tier === 'CORE') ?? dir.components[0];
      const o = metricAt(engine, c.offense_ref);
      const df = metricAt(engine, c.defense_ref);
      if (!o || !df || o.rank == null || df.rank == null) continue;
      out.push({ key: `${d}|${off}`, d, off, o: { rank: o.rank, of: o.universe_size }, df: { rank: df.rank, of: df.universe_size }, edge: Math.abs(dir.edge), metric: engine.registry[c.metric_id]?.name ?? c.metric_id.replace(/_/g, ' ') });
    }
  }
  return out.sort((a, b) => b.edge - a.edge);
}

export function CfbMatchupCard({ engine, codes, href, className = 'fx-span-5' }: { engine: Engine; codes: { home: string; away: string }; href: string; className?: string }) {
  const rows = useMemo(() => {
    const per = { home: 0, away: 0 };
    return cfbVsRows(engine).filter((x) => per[x.off]++ < 2).slice(0, 4);
  }, [engine]);
  const name = (side: 'home' | 'away') => engine.teams[side]?.name ?? side;
  return (
    <FxCard title="Key Matchup Advantages" icon="compare" className={`gdash__vs ${className}`} id="gd-cfb-vs" action={{ to: href, label: 'Full matchup' }}>
      {rows.length ? (
        <>
          <div className="gvs">
            {rows.map((x) => {
              const def = x.off === 'home' ? 'away' : 'home';
              return (
                <div key={x.key} className="gvs__row" style={{ ['--fx-home' as string]: teamColors('CFB', codes[x.off])[0], ['--fx-away' as string]: teamColors('CFB', codes[def])[0] }}>
                  <VsBar
                    label={DIMENSION_WORD[x.d] ?? x.d}
                    left={{ ...x.o, text: `${name(x.off)} offense, ${x.metric}` }}
                    right={{ ...x.df, text: `${name(def)} defense, ${x.metric}` }}
                    leftMark={<TeamMark sport="CFB" abbr={codes[x.off]} size="sm" />}
                    rightMark={<TeamMark sport="CFB" abbr={codes[def]} size="sm" />}
                  />
                </div>
              );
            })}
          </div>
          <p className="gdash__fine">Offense (left) vs the defense it faces · FBS rank, #1 best.</p>
        </>
      ) : (
        <p className={`gdash__state gdash__state--${engine.detail.state}`} role="status" title={engine.detail.reason ?? undefined}>
          <Icon name={engine.detail.state === 'loading' ? 'clock' : 'info'} size={16} />
          {engine.detail.state === 'loading'
            ? 'Loading the opponent-adjusted ranks…'
            : engine.detail.state === 'unavailable'
              ? 'Rank bars unavailable: the detailed research could not be restored (reason above).'
              : 'No opponent-adjusted ranks published for this game.'}
        </p>
      )}
    </FxCard>
  );
}
