// The real-scores switch (v4 early access) and the one-line feed status shown where games are listed. A score feed is a third party's
// data shown to this device's own user, so it is off until the viewer turns it on, remembered on this device, and one tap turns it off.
import { useState } from 'react';
import { disableFeed, enableFeed, useFeedEnabled } from '../live/scores/feed';
import { useScoreVersion } from '../live/scores/hooks';
import { scoreStore } from '../live/scores/runtime';
import { SOURCES } from '../live/scores/sources';
import { formatQuoteAge } from '../live/freshness';
import { useNow } from '../live/hooks';

/** SportScore's one condition: a visible, crawlable "Powered by SportScore" dofollow link wherever its data is shown. */
export function SportscoreBadge() {
  return <a href="https://sportscore.com/" rel="dofollow" target="_blank" title="Sports data by SportScore" className="v4-textlink">Powered by SportScore</a>;
}

export function LiveScoresSection() {
  const on = useFeedEnabled();
  const [said, setSaid] = useState('');
  return (
    <section className="v4-sblock" data-live-scores-section><h3>Live scores</h3>
      <p>Real scores for games in play are on by default in v4 early access. This device reads them while a game is on; nothing is requested while this is off. A score appears only when its game is matched to the SIFT game by both teams and start time, with its age, and is never estimated. Scores never feed research, prices or projections. NFL, college football and NHL scores are not offered: no free feed that permits this use covers them.</p>
      <div className="v4-ea__acts">
        {!on && <button type="button" className="v4-btn" data-live-scores-on onClick={() => { enableFeed(); setSaid('Live scores are on.'); }}>Turn on live scores</button>}
        {on && <button type="button" className="v4-btn v4-btn--sec" data-live-scores-off onClick={() => { disableFeed(); setSaid('Live scores are off.'); }}>Turn off live scores</button>}
      </div>
      <p className="meta">Source: <SportscoreBadge /> (NBA games, and finished tennis matches). Its free tier is open to personal and early-stage projects on the condition that link is shown; terms: {SOURCES.sportscore.terms.replace('https://', '')}.</p>

      <p className="v4-ea__said" aria-live="polite" data-live-scores-said>{said}</p>
    </section>
  );
}

/** "Scores from SportScore, MLB · 5 of 6 games in play window matched · answered 8s ago", or the honest reason there is nothing to show. Nothing while the feed is off. */
export function FeedNote() {
  const on = useFeedEnabled();
  useScoreVersion();
  const now = useNow(1000);
  if (!on) return null;
  const d = scoreStore.diagnostics();
  const names = d.providers.map((p) => SOURCES[p]?.label ?? p);
  const down = Object.entries(d.byProvider).filter(([, v]) => Object.values(v.status).some((x) => x === 'OUTAGE')).map(([k]) => SOURCES[k]?.label ?? k);
  const age = d.lastSuccessAt == null ? null : formatQuoteAge(Math.max(0, now - d.lastSuccessAt));
  let text: string;
  const spent = Object.values(d.byProvider).some((v) => v.lastError?.startsWith('rate_limited'));
  if (spent) text = "This device has used today's allowance of requests to SportScore. Scores resume tomorrow (UTC); nothing is estimated.";
  else if (d.observed === 0) text = `Live scores on (${names.join(', ')}). No game is in its playing window right now.`;
  else if (age == null && down.length) text = `${down.join(', ')} ${down.length === 1 ? 'is' : 'are'} not answering. No live score is shown; nothing is estimated.`;
  else text = `Scores from ${names.join(', ')} · ${d.matched} of ${d.observed} games in play window matched${age ? ` · feed answered ${age} ago` : ''}${down.length ? ` · ${down.join(', ')} not answering now` : ''}`;
  return <p className="meta" data-feed-note style={{ padding: '0 16px 8px' }}>{text}{d.providers.includes('sportscore') && <> · <SportscoreBadge /></>} · <button type="button" className="v4-textlink" data-feed-off onClick={disableFeed}>Turn off</button></p>;
}
