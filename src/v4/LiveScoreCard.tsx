// The Live tab's score block: score, period and clock, how fresh the number is, where it came from, and the recent scoring plays.
// Everything printed is a field of the matched provider game or its freshness read; nothing is inferred or filled in. The source and
// its attribution are always shown, with the time the feed says the state was true (or, when it gives none, the time it answered).
import type { ScoreRead } from '../live/scores/store';
import { periodClock, shownState } from './scoreState';
import { SOURCES } from '../live/scores/sources';
import { SportscoreBadge } from './LiveScoresControl';

const time = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : null);

export function LiveScoreCard({ read, awayN, homeN }: { read: ScoreRead; awayN: string; homeN: string }) {
  const game = read.game;
  const shown = shownState(read);
  if (!game || !shown || shown === 'upcoming') return null;
  const v = read.view;
  const over = shown === 'over';
  const sc = game.score;
  const aged = v.mode === 'DELAYED' || v.mode === 'LAST_KNOWN';
  const pc = periodClock(read);
  const heading = `${over ? 'Final' : v.mode === 'LAST_KNOWN' ? 'Last known score' : v.mode === 'DELAYED' ? 'In play · delayed' : 'In play'}`;
  const src = read.source ? SOURCES[read.source] : undefined;
  return (
    <>
      <div className="v4-card" data-live-score={v.mode.toLowerCase()} data-source={read.source ?? ''}>
        <h3>{heading}</h3>
        <div style={{ marginTop: 8 }}>
          {sc ? <div className="v4-kv"><span className="v4-kv__k">Score</span><span className="v4-kv__v num">{awayN} {sc.away} · {homeN} {sc.home}</span></div> : <div className="v4-kv"><span className="v4-kv__k">Score</span><span className="v4-kv__v">Not reported by the feed</span></div>}
          {!over && <div className="v4-kv"><span className="v4-kv__k">{game.clock?.display ? 'Period · clock' : 'Period'}</span><span className="v4-kv__v">{pc || game.clock?.periodLabel || 'Not reported'}{game.clock && game.clock.running === false && game.clock.display == null ? <em>Clock stopped</em> : null}</span></div>}
          <div className="v4-kv"><span className="v4-kv__k">Status</span><span className="v4-kv__v" data-live-label>{v.label}{aged && <em>{v.mode === 'DELAYED' ? 'Shown with its age; not labelled live' : 'The feed has stopped updating; this is the last answer it gave'}</em>}</span></div>
          <div className="v4-kv"><span className="v4-kv__k">Source</span><span className="v4-kv__v">{src?.long ?? game.provenance.provider}<em>{read.source === 'sportscore' ? <SportscoreBadge /> : (game.provenance.attribution ?? 'Unofficial feed; personal early-access use')}</em></span></div>
          {time(game.provenance.providerUpdatedAt) && <div className="v4-kv"><span className="v4-kv__k">As of</span><span className="v4-kv__v">{time(game.provenance.providerUpdatedAt)}<em>Feed's own time, or when SIFT read it</em></span></div>}
        </div>
      </div>
      {game.recentPlays && game.recentPlays.length > 0 && (
        <section aria-label="Recent scoring">
          <header className="v4-sechead"><h2>Recent scoring</h2><span className="v4-sechead__n">{game.recentPlays.length}</span></header>
          <ul className="v4-grp" data-plays>
            {game.recentPlays.map((p, i) => (
              <li key={i} className="v4-quote">
                <span className="v4-quote__t"><b>{p.text}</b><span>{[p.periodLabel, p.clock].filter(Boolean).join(' · ') || 'Time not reported'}</span></span>
                <span className="v4-playsc num" aria-label={`Score ${p.away} to ${p.home}`}>{p.away}–{p.home}<small>after</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
