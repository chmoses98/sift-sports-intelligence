// The real-scores switch (v4 early access) and the one-line feed status shown where games are listed. A score feed is a third party's
// data shown to this device's own user, so it is off until the viewer turns it on, remembered on this device, and one tap turns it off.
import { useState } from 'react';
import { disableFeed, enableFeed, useFeedEnabled } from '../live/scores/feed';
import { useScoreVersion } from '../live/scores/hooks';
import { scoreStore } from '../live/scores/runtime';
import { SOURCES } from '../live/scores/sources';
import { formatQuoteAge } from '../live/freshness';
import { useNow } from '../live/hooks';

export function LiveScoresSection() {
  const on = useFeedEnabled();
  const [said, setSaid] = useState('');
  const s = SOURCES.espn;
  return (
    <section className="v4-sblock" data-live-scores-section><h3>Live scores</h3>
      <p>Show real scores, periods and clocks on games in play. They come from the {s.long}, read by this device while a game is on; nothing is requested while this is off.</p>
      <div className="v4-ea__acts">
        {!on && <button type="button" className="v4-btn" onClick={() => { enableFeed(); setSaid('Live scores are on.'); }}>Turn on live scores</button>}
        {on && <button type="button" className="v4-btn v4-btn--sec" onClick={() => { disableFeed(); setSaid('Live scores are off.'); }}>Turn off live scores</button>}
      </div>
      <p className="v4-ea__said" role="status">{said}</p>
      <p className="meta">Personal early-access use. ESPN's terms of use apply to its data ({s.terms.replace('https://', '')}); a score is shown only when its game is matched to the SIFT game by both teams and start time, with its age, and never estimated. Scores never feed research, prices or projections.</p>
    </section>
  );
}

/** "Scores from ESPN · 5 of 6 games matched · updated 8s ago", or the honest reason there is nothing to show. Renders nothing while the feed is off. */
export function FeedNote() {
  const on = useFeedEnabled();
  useScoreVersion();
  const now = useNow(1000);
  if (!on) return null;
  const d = scoreStore.diagnostics();
  const sources = d.providers.map((p) => SOURCES[p]?.label ?? p).join(', ') || 'the score feed';
  const down = Object.values(d.status).some((x) => x === 'OUTAGE');
  const age = d.lastSuccessAt == null ? null : formatQuoteAge(Math.max(0, now - d.lastSuccessAt));
  const refused = Object.entries(d.refused).map(([k, n]) => `${n} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ');
  let text: string;
  if (d.observed === 0) text = `Live scores on (${sources}). No game is in its playing window right now.`;
  else if (down && age == null) text = `${sources} is not answering. No live score is shown; nothing is estimated.`;
  else text = `Scores from ${sources} · ${d.matched} of ${d.observed} games in play window matched${refused ? ` (not matched: ${refused})` : ''}${age ? ` · feed answered ${age} ago` : ''}${down ? ' · feed not answering now' : ''}`;
  return <p className="meta" data-feed-note style={{ padding: '0 16px 8px' }}>{text}</p>;
}
