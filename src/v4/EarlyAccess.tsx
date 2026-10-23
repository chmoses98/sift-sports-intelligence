// v4 early access: what it is, how to keep it on this phone, how to put it on the Home Screen, and the way back to SIFT 2.0.
// v4 is opt-in. Reaching #/v4 never changes what this device opens (a remembered choice is only ever made with a tap here, or by
// `?ui=v4`); SIFT 2.0 stays the default for everyone else. Nothing on this screen scores, prices or recommends anything.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { exitV4, isV4Remembered, rememberV4, UI_CHANGED } from '../lib/uiMode';
import { isStandalone } from '../lib/installIdentity';
import { Icon } from './Icon';
import { ExitLink } from './ExitLink';
import { useSheet } from './sheet';
import { LiveScoresSection } from './LiveScoresControl';

const PROMPT_KEY = 'sift.v4.prompt';
const SIFT2_HOME = '/design/sift2/home';

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(UI_CHANGED, cb);
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(UI_CHANGED, cb); };
};
/** Is v4 kept on this device (the viewer's own choice)? Follows changes made anywhere in the app, and in other tabs. */
export const useV4Kept = () => useSyncExternalStore(subscribe, isV4Remembered, () => false);

const promptSeen = () => { try { return localStorage.getItem(PROMPT_KEY) === 'later'; } catch { return false; } };

/** The commit this copy was built from, and the latest published one (null when the site publishes none, as in a local build). */
function useBuilds() {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { sha?: string; built_at?: string } | null) => { if (live && j?.sha) setLatest(`${String(j.sha).slice(0, 7)}${j.built_at ? ` · ${j.built_at}` : ''}`); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return { mine: __SIFT_BUILD__, latest };
}

export function EarlyAccessSheet() {
  const { close } = useSheet();
  const kept = useV4Kept();
  const standalone = isStandalone();
  const builds = useBuilds();
  const [said, setSaid] = useState('');
  const stale = builds.latest != null && builds.mine !== 'dev' && !builds.latest.startsWith(builds.mine);
  return (
    <>
      <div className="v4-shead">
        <div className="v4-shead__t">
          <h2 data-autofocus tabIndex={-1}>SIFT v4 · early access</h2>
          <p className="v4-shead__m">An opt-in preview. SIFT 2.0 is still the default for everyone.</p>
        </div>
        <button type="button" className="v4-gbtn" onClick={close} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="v4-sbody" tabIndex={0}>
        <section className="v4-sblock"><h3>On this device</h3>
          <p>{kept ? 'v4 is kept on this device: opening SIFT here lands in v4.' : 'v4 opens when you use its address. Keep it to make this device open v4 first.'}</p>
          <div className="v4-ea__acts">
            {!kept && <button type="button" className="v4-btn" onClick={() => { rememberV4(); setSaid('v4 is now kept on this device.'); }}>Keep v4 on this device</button>}
            {kept && <button type="button" className="v4-btn v4-btn--sec" onClick={() => { exitV4(); setSaid('v4 is no longer kept on this device. SIFT 2.0 opens first again.'); }}>Stop keeping v4</button>}
            <ExitLink to={SIFT2_HOME} className="v4-btn v4-btn--sec">Return to SIFT 2.0</ExitLink>
          </div>
          <p className="v4-ea__said" role="status">{said}</p>
          <p className="meta">Returning to SIFT 2.0 also stops v4 being kept here. Your saved Board is shared by both and is not touched.</p>
        </section>

        <section className="v4-sblock"><h3>What to expect</h3>
          <ul className="v4-sbullets">
            <li>Real NBA scores are on by default here (NFL, college football and NHL scores are not available). A game with no verified match shows "score unavailable", and no score is ever estimated. You can turn live scores off below.</li>
            <li>Prices come from the market feed only when it has a current quote, and say how old it is. When it has none, the screen says so.</li>
            <li>Research only. SIFT does not recommend bets.</li>
          </ul>
        </section>

        <LiveScoresSection />

        <section className="v4-sblock"><h3>{standalone ? 'You are in the Home Screen app' : 'Add to your iPhone Home Screen'}</h3>
          {standalone ? (
            <p>This icon always opens v4. Your SIFT 2.0 icon, if you have one, is a separate app and is unchanged.</p>
          ) : (
            <>
              <ol className="v4-ea__steps">
                <li>In <b>Safari</b>, open the dedicated <a href={`${import.meta.env.BASE_URL}v4/`}>SIFT v4 install page</a> (not the old #/v4 address).</li>
                <li>Tap <b>Share</b>, then <b>Add to Home Screen</b>. Enable <b>Open as Web App</b> if offered.</li>
                <li>Keep the name <b>SIFT v4</b>, tap <b>Add</b>, and remove any old broken v4 icon.</li>
              </ol>
              <p className="meta">On iPhone the Home Screen app keeps its own saved Board: Safari and the Home Screen app do not share saved research. Pick one place to use it day to day.</p>
            </>
          )}
        </section>

        <section className="v4-sblock"><h3>This copy</h3>
          <p className="meta" data-v4-build>Build {builds.mine}{builds.latest ? ` · latest published ${builds.latest}` : ''}</p>
          {stale && <p className="v4-pstat" role="status">A newer version is published. Close and reopen SIFT to load it.</p>}
        </section>
      </div>
      <div className="v4-sfoot">
        <button type="button" className="v4-btn v4-btn--sec" onClick={close}>Done</button>
      </div>
    </>
  );
}

/** The first thing a new v4 visitor sees on Home: say what this is and offer to keep it. Not shown in the Home Screen app (the icon is the choice) or once decided. */
export function EarlyAccessCard() {
  const kept = useV4Kept();
  const sheet = useSheet();
  const [later, setLater] = useState(promptSeen);
  const [said, setSaid] = useState('');
  if (isStandalone()) return null;
  return (
    <>
      <p className="sr" role="status">{said}</p>
      {!kept && !later && (
        <section className="v4-note v4-ea" aria-label="SIFT v4 early access">
          <Icon name="info" />
          <div>
            <b>You are in SIFT v4 early access</b>
            SIFT 2.0 is still the default for everyone. Keep v4 on this device to open it first here.
            <div className="v4-ea__acts">
              <button type="button" className="v4-btn" onClick={() => { rememberV4(); setSaid('v4 is now kept on this device.'); }}>Keep v4 on this device</button>
              <button type="button" className="v4-btn v4-btn--sec" onClick={() => { try { localStorage.setItem(PROMPT_KEY, 'later'); } catch { /* asked again next visit */ } setLater(true); setSaid('Not now. You can keep v4 any time from early access.'); }}>Not now</button>
            </div>
            <button type="button" className="v4-textlink" onClick={() => sheet.open(<EarlyAccessSheet />, { label: 'SIFT v4 early access' })}>About early access and the Home Screen</button>
          </div>
        </section>
      )}
    </>
  );
}

/** The header pill on Home: a real control that opens the early-access sheet. */
export function EarlyAccessPill() {
  const sheet = useSheet();
  return (
    <button type="button" className="v4-pillbtn" aria-label="SIFT v4 early access: about, Home Screen and return to SIFT 2.0" onClick={() => sheet.open(<EarlyAccessSheet />, { label: 'SIFT v4 early access' })}>
      <span className="v4-pill">v4 early access</span>
    </button>
  );
}

/** At the foot of every v4 screen: where you are, and the way back to SIFT 2.0. */
export function EarlyAccessFooter() {
  const sheet = useSheet();
  return (
    <footer className="v4-eafoot">
      <button type="button" className="v4-textlink" onClick={() => sheet.open(<EarlyAccessSheet />, { label: 'SIFT v4 early access' })}>SIFT v4 early access</button>
      <ExitLink to={SIFT2_HOME} className="v4-textlink">Return to SIFT 2.0</ExitLink>
    </footer>
  );
}
