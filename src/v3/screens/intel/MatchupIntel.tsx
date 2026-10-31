// Matchup Intelligence: the research on a game's Overview. A pregame Overview reads projection, top advantages, comparison, player
// matchups, lineup and injury notes, pace and scoring, then game script; the existing market and props cards follow (GameTabs.tsx).
// A live or final game keeps the same research in a "Pregame analysis" section lower down (never hidden); live ordering is a later workstream.
// Each section exists only when its data does (data/intel/build.ts); the projection card is always present for a real game and says why when
// there is no model view. CFB games that carry the Script Engine are presented by that view (it owns the projection and script).
import { useGameIntel } from '../../data/intel/useGameIntel';
import type { GameIntel, IntelSection } from '../../data/intel/build';
import type { GameCtx } from '../GameShared';
import './intel.css';
import { ProjectionCard } from './ProjectionCard';
import { AdvantagesSection, ComparisonSection, EnvironmentSection, MismatchSection, NotesSection, ScriptSection } from './sections';

function Sections({ ctx, intel, priced }: { ctx: GameCtx; intel: GameIntel; priced: boolean }) {
  const has = (s: IntelSection) => intel.present.includes(s);
  return (
    <>
      {has('projection') && <ProjectionCard ctx={ctx} projection={intel.projection} priced={priced} />}
      {has('advantages') && <AdvantagesSection ctx={ctx} intel={intel} />}
      {has('comparison') && intel.comparison && <ComparisonSection ctx={ctx} comparison={intel.comparison} />}
      {has('mismatches') && <MismatchSection ctx={ctx} items={intel.mismatches} />}
      {has('notes') && intel.notes && <NotesSection ctx={ctx} notes={intel.notes} />}
      {has('environment') && intel.environment && <EnvironmentSection env={intel.environment} />}
      {has('script') && intel.script && <ScriptSection script={intel.script} />}
      {intel.gaps.length > 0 && (
        <details className="mi-gaps x-card" data-testid="intel-gaps">
          <summary>Not published for this game ({intel.gaps.length})</summary>
          <ul>{intel.gaps.map((x) => <li key={x.section}>{x.reason}</li>)}</ul>
        </details>
      )}
    </>
  );
}

function Body({ ctx, slot }: { ctx: GameCtx; slot: 'pregame' | 'after' }) {
  const { intel, loading } = useGameIntel(ctx);
  const waiting = loading && !ctx.research;
  if (waiting) return <div className="v3-skel mi-skel" role="status" aria-label="Loading matchup research" />;
  const priced = slot === 'pregame';
  if (slot === 'pregame') return <Sections ctx={ctx} intel={intel} priced={priced} />;
  return (
    <section aria-label="Pregame analysis" className="mi-after" data-testid="pregame-analysis">
      <h2 className="v3-h2">Pregame analysis</h2>
      <p className="v3-note">Research published before the game started. It is not a graded result and is not updated with play.</p>
      <Sections ctx={ctx} intel={intel} priced={priced} />
    </section>
  );
}

/** `slot`: where the caller renders it. A pregame game shows the research first; every other phase shows it as "Pregame analysis" lower down. */
export function MatchupIntel({ ctx, slot }: { ctx: GameCtx; slot: 'pregame' | 'after' }) {
  const g = ctx.g;
  if (g.provenance !== 'publication') return null;
  if ((slot === 'pregame') !== (g.phase === 'pregame')) return null;
  return <Body ctx={ctx} slot={slot} />;
}
