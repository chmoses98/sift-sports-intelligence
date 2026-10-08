// Small NHL building blocks shared by the slate and the game page: team identity (logo + tricode, always together),
// game phase, freshness, the win-probability split, goalie status and the compact research-status pill.
import { Link } from 'react-router';
import { TeamMark } from '../../components/ui';
import { nhlTeam } from '../../lib/nhlTeams';
import { STAGE_WORD, learningLine, type Learning } from '../../lib/nhl';
import { FRESH_WORD, ageMs, ageWords, type Fresh, type GamePhase, type GoalieLine } from '../../lib/nhlStory';
import { routes } from '../../lib/routes';
import { teamAccent } from '../../lib/teams';
import { Glyph } from './glyphs';
import '../../styles/nhl.css';
import '../../styles/nhl-story.css';

/** Logo + tricode (+ nickname when asked). The tricode is always visible text, so identity never depends on the image. */
export function TeamChip({ abbr, size = 'sm', name, className }: { abbr: string | null | undefined; size?: 'sm' | 'md' | 'lg'; name?: 'nick' | 'full'; className?: string }) {
  const t = nhlTeam(abbr);
  return (
    <span className={`ntc ntc--${size}${className ? ` ${className}` : ''}`}>
      <TeamMark sport="NHL" abbr={abbr} size={size} />
      <span className="ntc__t">
        <b className="ntc__a">{t?.code ?? abbr ?? '—'}</b>
        {name && t && <span className="ntc__n">{name === 'full' ? `${t.city} ${t.name}` : t.name}</span>}
      </span>
    </span>
  );
}

export function PhaseChip({ phase, score, home, away }: { phase: GamePhase; score?: { home: number; away: number } | null; home?: string; away?: string }) {
  if (phase === 'FINAL') {
    return <span className="nphase nphase--final">Final{score && home && away ? <b className="num"> {away} {score.away} – {home} {score.home}</b> : null}</span>;
  }
  if (phase === 'LIVE') return <span className="nphase nphase--live"><i aria-hidden="true" />Live</span>;
  return <span className="nphase nphase--up">Upcoming</span>;
}

/** "Model · Current" with the age on hover/focus; stale states are visible, never silent. */
export function FreshPill({ label, state, at, now, glyph }: { label: string; state: Fresh; at?: string | null; now: number; glyph?: string }) {
  const age = ageMs(at ?? null, now);
  const title = `${label}: ${FRESH_WORD[state]}${at ? ` · ${new Date(at).toLocaleString()} (${ageWords(age)})` : ''}`;
  return (
    <span className={`nfresh nfresh--${state.toLowerCase()}`} title={title} data-fresh={state}>
      {glyph ? <Glyph name={glyph} size={14} /> : <i aria-hidden="true" />}
      <span className="nfresh__l">{label}</span>
      <span className="nfresh__v">{state === 'CURRENT' && age != null ? ageWords(age) : FRESH_WORD[state]}</span>
    </span>
  );
}

/** The model's win probability as a two-team split in team colours: one bar, two labelled numbers. */
export function WinSplit({ home, away, pHome, compact }: { home: string; away: string; pHome: number | null; compact?: boolean }) {
  if (pHome == null) return null;
  const a = Math.round((1 - pHome) * 100);
  const h = 100 - a;
  return (
    <div className={`nws${compact ? ' nws--compact' : ''}`} role="img" aria-label={`Model win probability: ${away} ${a}%, ${home} ${h}%`} style={{ ['--a' as string]: teamAccent('NHL', away), ['--h' as string]: teamAccent('NHL', home) }}>
      <span className={`nws__v num${a > h ? ' is-fav' : ''}`}>{a}%</span>
      <span className="nws__bar" aria-hidden="true"><i style={{ width: `${a}%` }} /><i style={{ width: `${h}%` }} /></span>
      <span className={`nws__v num${h > a ? ' is-fav' : ''}`}>{h}%</span>
    </div>
  );
}

const G_WORD: Record<string, string> = { CONFIRMED: 'Confirmed', PROBABLE: 'Probable', PROJECTED: 'Projected', EXPECTED: 'Expected', UNKNOWN: 'Unconfirmed' };

export function GoalieBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? 'UNKNOWN').toUpperCase();
  return <span className={`ngst ngst--${s === 'CONFIRMED' ? 'ok' : s === 'PROBABLE' ? 'mid' : 'warn'}`}>{G_WORD[s] ?? s.toLowerCase()}</span>;
}

/** One goalie in a single tight line: mask glyph, name, status. */
export function GoalieInline({ g }: { g: GoalieLine | undefined }) {
  if (!g) return <span className="ngi ngi--none"><Glyph name="mask" size={14} /> Starter not published</span>;
  return (
    <span className="ngi">
      <Glyph name="mask" size={14} />
      <span className="ngi__n">{g.name ?? 'Starter unknown'}</span>
      <GoalieBadge status={g.status} />
    </span>
  );
}

/** "Research model · Learning · 44 games tracked" — honest, compact, a link to the scorecard. */
export function ResearchPill({ learning, slug, bare }: { learning: Learning | null; slug: string; bare?: boolean }) {
  const stage = learning?.stage?.stage;
  const word = stage ? STAGE_WORD[stage] ?? stage : 'Learning';
  const c = learning?.counts ?? {};
  const failed = learning?.status === 'STALE_LAST_RUN_FAILED';
  return (
    <Link to={routes.scorecard(slug)} className={`nrp${failed ? ' nrp--warn' : ''}`} title={learningLine(learning) ?? 'No learning scorecard published yet'} aria-label={`NHL model status: ${word}. Open the NHL scorecard.`}>
      <span className="nrp__k">Research model</span>
      <span className="nrp__v">{word}</span>
      {!bare && c.games_projected != null && <span className="nrp__n">{Number(c.games_projected).toLocaleString('en-US')} games tracked · {Number(c.games_settled ?? 0).toLocaleString('en-US')} settled</span>}
    </Link>
  );
}

/** A labelled number with an optional glyph: the unit of the slate rows and the game summary. */
export function Stat({ glyph, label, value, sub, tone }: { glyph?: string; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'warn' | 'pos' }) {
  return (
    <span className={`nstat${tone ? ` nstat--${tone}` : ''}`}>
      <span className="nstat__l">{glyph && <Glyph name={glyph} size={14} />}{label}</span>
      <span className="nstat__v">{value}</span>
      {sub && <span className="nstat__s">{sub}</span>}
    </span>
  );
}
