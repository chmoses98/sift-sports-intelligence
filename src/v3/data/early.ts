// SIFT 3.0 starts its first screen's work the moment the entry script runs, not when React has mounted three lazy layers.
//
// A phone that opens `#/v3...` used to go: entry script -> React mounts -> V3Root chunk requested -> V3Root renders -> the screen's chunk
// requested -> the slate hook runs -> sport health -> board -> recommendations (a chain of round trips, one after the other). Everything in that
// chain is known from the address alone, so it all starts here instead, in parallel: the shell chunk, the screen's chunk, and the slate's documents
// (health, board and recommendations of every sport at once, with the existence probe and the research fetch bound that V3Root also sets).
// The documents are read through the app's own memoised readers (`getJson`, `resolveSource`), so when the slate hook asks, every answer is already
// in flight or in hand; a failed early read is not remembered (the readers never cache a failure), so the hook simply asks again.
//
// Nothing here is rendered, stored or shown. Sample-data mode (`demo`) skips everything; the screens that never read the slate (Statistic Detail, Settings) skip the slate.
import { getJson, joinUrl, RESEARCH_FETCH_TIMEOUT_MS, setExistenceProbe, setFetchTimeout } from '../../data/fetcher';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { explorable, SPORTS, sportBySlug } from '../../data/sports';
import { prefetchLeanSlate } from '../../opportunity/load';
import { warmProps } from './props/early';

declare const __SIFT_SAMPLE_ONLY__: boolean | undefined;

const none = () => undefined;

/** The research fetch bound SIFT 3.0 runs under (V3Root sets the same on mount; `__SIFT_FETCH_TIMEOUT_MS__` is the unavailable-data test seam). */
export function applyV3FetchBounds(): void {
  const o = typeof window === 'undefined' ? undefined : (window as unknown as { __SIFT_FETCH_TIMEOUT_MS__?: number }).__SIFT_FETCH_TIMEOUT_MS__;
  setFetchTimeout(typeof o === 'number' && o > 0 ? o : RESEARCH_FETCH_TIMEOUT_MS);
  setExistenceProbe(true);
}

/** The v3 path of an address hash ("#/v3/games?x=1" -> "/v3/games"), or null when the address is not SIFT 3.0's. */
export function v3PathOf(hash: string): string | null {
  const m = /^#(\/v3(?:\/[^?#]*)?)(?:\?.*)?$/.exec(hash);
  return m ? m[1].replace(/\/+$/, '') || '/v3' : null;
}

/** Documents of one sport the slate asks for, asked now at once (the chain health -> board -> recommendations would otherwise run one after the other). */
function warmSport(s: (typeof SPORTS)[number]): void {
  for (const f of ['health.json', 'board.json', 'recommendations.json', ...(s.code === 'SOCCER' ? ['theses.json'] : [])]) void getJson(joinUrl(s.rawBase, f)).catch(none);
}

/**
 * The documents a team, player, statistic or game screen asks for first, asked for as soon as the address names them: the sport's source decision, its
 * explorer index (the file table), and the entity's own profile (and the metric definitions the team and statistic screens read; the game's contract
 * document). The screen would ask for exactly these, one after another, once it had mounted; each answer is memoised by the reader, so the screen finds it.
 */
async function warmEntity(path: string): Promise<void> {
  const m = /^\/v3\/(team|player|stat|game)\/([a-z]+)\/([^/]+)/.exec(path);
  if (!m) return;
  const [, kind, slug, raw] = m;
  const id = decodeURIComponent(raw);
  const sport = sportBySlug(slug);
  if (!sport) return;
  const repo = new SportRepo(await resolveSource(sport));
  if (kind === 'game') { await repo.eventDetail(id); return; }
  if (!repo.hasExplorer) return;
  const index = await repo.index();
  const jobs: Promise<unknown>[] = [];
  if (kind === 'team') {
    const t = index.teams.find((x) => x.short_name === id);
    if (t) jobs.push(repo.profile(t.participant_id));
    jobs.push(repo.metrics());
  } else if (kind === 'player') {
    jobs.push(repo.profile(id), repo.searchIndex());
  } else if (index.teams[0]) {
    jobs.push(repo.profile(index.teams[0].participant_id), repo.metrics());
  }
  await Promise.allSettled(jobs);
}

export function startEarly(loadShell: () => Promise<unknown>, screens: [RegExp, () => Promise<unknown>][]): void {
  try {
    if (typeof location === 'undefined') return;
    const path = v3PathOf(location.hash);
    if (!path) return;
    void loadShell().catch(none);
    const screen = screens.find(([re]) => re.test(path));
    if (screen) void screen[1]().catch(none);
    const sampleOnly = typeof __SIFT_SAMPLE_ONLY__ !== 'undefined' && __SIFT_SAMPLE_ONLY__ === true;
    let demo = sampleOnly;
    try { demo = demo || (sessionStorage.getItem('sift3.demo') === '1' && !/[?&]demo=0(?:&|$)/.test(location.hash)) || /[?&]demo=1(?:&|$)/.test(location.hash); } catch { /* storage blocked: real mode */ }
    if (demo || /^\/v3\/settings(?:\/|$)/.test(path)) return;
    applyV3FetchBounds();
    void warmEntity(path).catch(none);
    if (/^\/v3\/stat(?:\/|$)/.test(path)) return; // Statistic Detail never reads the slate
    for (const s of SPORTS.filter(explorable)) warmSport(s);
    prefetchLeanSlate();
    if (/^\/v3\/props(?:\/|$)/.test(path)) void warmProps().catch(none);
  } catch { /* an early start is only ever an optimisation */ }
}
