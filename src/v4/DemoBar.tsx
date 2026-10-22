// The Live Score Demo's visible controls: a bar on every v4 screen while it is on (so simulated scores can never be mistaken for
// live results), the sheet that drives it, and the opt-in section in early access. Off by default; one tap turns it off.
import { useState } from 'react';
import { DEMO_SCENARIOS, demoNow, disableDemo, enableDemo, restartDemo, setGameMinutes, setScenario, skipAhead, useDemoState } from '../live/scores/demo/state';
import { useScoreVersion } from '../live/scores/hooks';
import { scoreStore } from '../live/scores/runtime';
import { Icon } from './Icon';
import { useSheet } from './sheet';

export function DemoSheet() {
  const st = useDemoState();
  const { close } = useSheet();
  useScoreVersion();
  const d = scoreStore.diagnostics();
  const refused = Object.entries(d.refused);
  const scenario = DEMO_SCENARIOS.find((s) => s.id === st.scenario);
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t">
          <h2 data-autofocus tabIndex={-1}>Live Score Demo</h2>
          <p className="v4-shead__m">Simulated scores, clocks and plays on the real games.</p>
        </div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody" tabIndex={0}>
        <section className="v4-sblock"><h3>What this is</h3>
          <ul className="v4-sbullets">
            <li>Every score, period, clock and scoring play is <b>simulated</b> from each game's teams and labelled DEMO. None of it is a real result.</li>
            <li>Research, Kalshi prices, projections and signals are the real published ones and are not affected. A game's pregame research freezes at its real kickoff, not the demo's.</li>
            <li>It is device-local and off by default.</li>
          </ul>
        </section>
        <section className="v4-sblock"><h3>The feed</h3>
          <div className="v4-seg" role="radiogroup" aria-label="Simulated feed behaviour" style={{ flexWrap: 'wrap', height: 'auto' }}>
            {DEMO_SCENARIOS.map((s) => <button key={s.id} type="button" role="radio" aria-checked={st.scenario === s.id} data-demo-scenario={s.id} aria-pressed={st.scenario === s.id} onClick={() => setScenario(s.id)}>{s.label}</button>)}
          </div>
          <p className="meta" style={{ marginTop: 8 }}>{scenario?.hint}</p>
        </section>
        <section className="v4-sblock"><h3>Pace</h3>
          <div className="v4-seg" role="radiogroup" aria-label="Length of a simulated game">
            {([2, 5, 12] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={st.gameMinutes === m} aria-pressed={st.gameMinutes === m} onClick={() => setGameMinutes(m)}>{m} min</button>)}
          </div>
          <p className="meta" style={{ marginTop: 8 }}>How long one simulated game takes to play. Changing it restarts the demo.</p>
          <div className="v4-ea__acts">
            <button type="button" className="v4-btn v4-btn--sec" onClick={() => skipAhead(60_000)}>Skip ahead 1 min</button>
            <button type="button" className="v4-btn v4-btn--sec" onClick={() => skipAhead(300_000)}>Skip ahead 5 min</button>
            <button type="button" className="v4-btn v4-btn--sec" onClick={() => restartDemo()}>Restart demo</button>
          </div>
          <p className="meta">Skip ahead moves the demo clock, so every simulated age moves with it: stall the feed, then skip ahead to watch a score go from live to delayed to stale.</p>
        </section>
        <section className="v4-sblock"><h3>Identity check</h3>
          <p className="meta" data-demo-diag>{d.observed} games on screen · {d.offered} feed games offered · {d.matched} matched{refused.length ? ` · refused: ${refused.map(([k, n]) => `${n} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ')}` : ''}. The feed deliberately includes games that are not on screen (the same teams a day later, a reversed pairing); each is refused.</p>
          {d.anomalies.length > 0 && <p className="v4-pstat" role="status">{d.anomalies.join(' · ')}</p>}
        </section>
      </div>
      <div className="v4-sfoot">
        <button type="button" className="v4-btn" onClick={() => { disableDemo(); close(); }}>Turn off Live Score Demo</button>
      </div>
    </>
  );
}

/** Shown at the top of every v4 screen while the demo is on. */
export function DemoBar() {
  const st = useDemoState();
  const sheet = useSheet();
  if (!st.on) return null;
  const sc = DEMO_SCENARIOS.find((s) => s.id === st.scenario);
  return (
    <div className="v4-demobar" role="region" aria-label="Live Score Demo is on" data-demo-bar>
      <span className="v4-demobar__t"><b>DEMO</b> Scores are simulated{st.scenario !== 'normal' && <> · feed: {sc?.label.toLowerCase()}</>}</span>
      <button type="button" className="v4-demobar__b" onClick={() => sheet.open(<DemoSheet />, { label: 'Live Score Demo' })}>Controls</button>
      <button type="button" className="v4-demobar__b" onClick={() => disableDemo()}>Turn off</button>
    </div>
  );
}

/** In early access: the opt-in. */
export function DemoSection() {
  const st = useDemoState();
  const sheet = useSheet();
  const [said, setSaid] = useState('');
  return (
    <section className="v4-sblock" data-demo-section><h3>Live Score Demo</h3>
      <p>Try SIFT as a live companion. This switches on <b>simulated</b> scores, periods and clocks for the games on Home, Games and each game screen, every one labelled DEMO. They are not real results, and your real research, prices and projections stay as they are.</p>
      <div className="v4-ea__acts">
        {!st.on && <button type="button" className="v4-btn" onClick={() => { enableDemo(); setSaid('Live Score Demo is on. Every score is simulated and labelled DEMO.'); }}>Turn on Live Score Demo</button>}
        {st.on && <button type="button" className="v4-btn" onClick={() => sheet.open(<DemoSheet />, { label: 'Live Score Demo' })}>Demo controls</button>}
        {st.on && <button type="button" className="v4-btn v4-btn--sec" onClick={() => { disableDemo(); setSaid('Live Score Demo is off.'); }}>Turn off</button>}
      </div>
      <p className="v4-ea__said" role="status">{said}</p>
      <p className="meta">Demo time is {new Date(demoNow()).toLocaleTimeString()}.</p>
    </section>
  );
}
