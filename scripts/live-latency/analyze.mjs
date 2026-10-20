// Turns the probe's records into score-change delays. Pure functions, no I/O (the CLI at the bottom reads files).
//
// IDENTITY. A score change is identified by what it IS, not by when it was counted:
//   * feed ↔ feed: the resulting score. Every feed reports the same score progression (0-0 → 0-3 → 7-3 …), so a step is the
//     key "<away>-<home>" (plus a revisit counter if a score returns after a correction). No counting by order.
//   * Real / truth taps ↔ feed steps: a tap carries the TEAM that scored and a wall-clock time. Taps and steps are
//     aligned per game by a monotone longest-common-subsequence over (team, time within WINDOW_MS), so a missed tap or a
//     step a feed skipped costs only that pair; it does not shift everything after it. A pair is "high" confidence only if
//     every other step of the same team is at least MARGIN_MS farther from the tap than the matched one; where scoring is
//     dense (basketball) many pairs are "low" and are reported separately, not mixed into the headline numbers.
//
// WHAT IS UNCERTAIN, and reported rather than hidden:
//   * a poll that first sees a change only proves it happened since the previous poll: each feed observation is a window
//     [prevPollAt, seenAt]; every delay carries ± the window half-widths of both observations;
//   * a human tap has reaction error (HUMAN_MS each side);
//   * a feed can skip a step (two scores between polls, or it never shows one): counted as MISSED per source;
//   * a tap with no step, or a step with no tap, is listed as unmatched;
//   * relative delays between observers on ONE machine do not depend on that machine's clock accuracy. The clock
//     check from HTTP Date headers is a sanity warning, not a correction.
//   * absolute (event-to-screen) latency exists only if there are truth taps; otherwise results are relative to the
//     fastest observer, which may itself be late.

export const HUMAN_MS = 700;
export const WINDOW_MS = 45_000;
/** A tap pair is high-confidence only if the next-nearest same-team step is this much farther from the tap. */
export const MARGIN_MS = 15_000;
/** Pairs further apart than this are flagged: either a wrong alignment or an observer that is genuinely that far off. */
export const OUTLIER_MS = 30_000;

const parse = (s) => (typeof s === 'string' && /^\d+-\d+$/.test(s) ? s.split('-').map(Number) : null);
const mid = (o) => (o.prevPollAt + o.seenAt) / 2;
const half = (o) => (o.seenAt - o.prevPollAt) / 2;

export function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

/** Marks with undo applied (an undo removes the latest earlier mark of the same game and kind) and double-taps dropped. */
export function cleanMarks(marks) {
  const out = [];
  for (const m of [...marks].sort((a, b) => a.at - b.at)) {
    if (m.kind === 'undo') {
      for (let i = out.length - 1; i >= 0; i--) if (out[i].game === m.game && out[i].of === m.of) { out.splice(i, 1); break; }
      continue;
    }
    const dup = out.find((x) => x.game === m.game && x.kind === m.kind && x.team === m.team && m.at - x.at < 2000);
    if (!dup) out.push({ ...m, of: m.kind });
  }
  return out;
}

/** Per game: the score progression as steps, each with the observation every source made of it. */
export function buildChains(records) {
  const per = new Map(); // game -> src -> states[]
  const add = (r, baseline) => {
    const sc = parse(r.score);
    if (!sc) return;
    if (!per.has(r.game)) per.set(r.game, new Map());
    const m = per.get(r.game);
    if (!m.has(r.src)) m.set(r.src, []);
    m.get(r.src).push({ score: r.score, a: sc[0], h: sc[1], baseline, seenAt: r.seenAt, prevPollAt: baseline ? r.seenAt : r.prevPollAt });
  };
  for (const r of records) {
    if (r.type === 'baseline') add(r, true);
    else if (r.type === 'change' && r.kind === 'score') add(r, false);
  }
  const chains = new Map();
  for (const [game, bySrc] of per) {
    const steps = new Map(); // key -> step
    for (const [src, states] of bySrc) {
      states.sort((x, y) => x.seenAt - y.seenAt);
      const seen = new Map();
      states.forEach((st, idx) => {
        const n = (seen.get(st.score) ?? 0) + 1;
        seen.set(st.score, n);
        const key = n === 1 ? st.score : `${st.score}#${n}`;
        if (!steps.has(key)) steps.set(key, { key, score: st.score, a: st.a, h: st.h, total: st.a + st.h, obs: new Map(), first: new Map() });
        const step = steps.get(key);
        step.obs.set(src, st);
        if (idx === 0) step.first.set(src, true);
      });
    }
    const ordered = [...steps.values()].sort((x, y) => x.total - y.total || Math.min(...[...x.obs.values()].map((o) => o.seenAt)) - Math.min(...[...y.obs.values()].map((o) => o.seenAt)));
    ordered.forEach((s, i) => {
      const p = ordered[i - 1];
      const da = p ? s.a - p.a : 0;
      const dh = p ? s.h - p.h : 0;
      s.team = !p ? null : da > 0 && dh === 0 ? 'away' : dh > 0 && da === 0 ? 'home' : da > 0 && dh > 0 ? 'multi' : 'correction';
      const live = [...s.obs.values()].filter((o) => !o.baseline);
      s.time = live.length ? Math.min(...live.map(mid)) : null;
    });
    chains.set(game, ordered);
  }
  return chains;
}

/** Monotone alignment of taps to steps of the same team within the window. Returns pairs and what is left over. */
export function alignTaps(taps, steps, windowMs = WINDOW_MS) {
  const T = taps.sort((a, b) => a.at - b.at);
  const S = steps.filter((s) => (s.team === 'away' || s.team === 'home') && s.time != null).sort((a, b) => a.time - b.time);
  const ok = (t, s) => t.team === s.team && Math.abs(t.at - s.time) <= windowMs;
  const dp = Array.from({ length: T.length + 1 }, () => new Array(S.length + 1).fill(0));
  for (let i = 1; i <= T.length; i++) for (let j = 1; j <= S.length; j++) {
    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], ok(T[i - 1], S[j - 1]) ? dp[i - 1][j - 1] + 1 : 0);
  }
  const pairs = [];
  const usedT = new Set();
  const usedS = new Set();
  let i = T.length;
  let j = S.length;
  while (i > 0 && j > 0) {
    if (ok(T[i - 1], S[j - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) { pairs.push({ tap: T[i - 1], step: S[j - 1] }); usedT.add(i - 1); usedS.add(j - 1); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  pairs.reverse();
  // High confidence = the matched step is clearly the nearest same-team step: every rival is at least MARGIN_MS farther from
  // the tap than the match is. Otherwise another step could equally be the one the tap was reacting to.
  for (const p of pairs) {
    const d = Math.abs(p.tap.at - p.step.time);
    const rival = Math.min(Infinity, ...S.filter((s) => s !== p.step && s.team === p.tap.team).map((s) => Math.abs(p.tap.at - s.time)));
    p.confidence = rival - d >= MARGIN_MS ? 'high' : 'low';
  }
  return { pairs, unmatchedTaps: T.filter((_, k) => !usedT.has(k)), unmatchedSteps: S.filter((_, k) => !usedS.has(k)) };
}

/** Local-clock sanity from HTTP Date headers (1 s resolution, uncached responses only). Informational. */
export function clockCheck(records) {
  const xs = records.filter((r) => r.type === 'poll' && r.httpDate && (r.age == null || Number(r.age) === 0) && r.rttMs != null)
    .map((r) => Date.parse(r.httpDate) + 500 - (r.at + r.rttMs / 2)).filter(Number.isFinite);
  if (xs.length < 5) return { n: xs.length, offsetMs: null, halfWidthMs: null };
  return { n: xs.length, offsetMs: Math.round(quantile(xs, 0.5)), halfWidthMs: 500 + Math.round(quantile(records.filter((r) => r.rttMs != null).map((r) => r.rttMs / 2), 0.5)) };
}

const stats = (ds) => {
  if (!ds.length) return null;
  const xs = ds.map((d) => d.delayMs);
  return { n: xs.length, medianMs: Math.round(quantile(xs, 0.5)), p90Ms: Math.round(quantile(xs, 0.9)), maxMs: Math.max(...xs), minMs: Math.min(...xs), medianUncertaintyMs: Math.round(quantile(ds.map((d) => d.uncertaintyMs), 0.5)) };
};

/**
 * ref = 'fastest' (earliest feed observation of each step), 'truth' (the truth taps), or a feed id.
 * Marks: { kind: 'real'|'truth'|'undo', game, team: 'away'|'home', at, of? }.
 */
export function compare(records, rawMarks = [], { ref = 'fastest', windowMs = WINDOW_MS } = {}) {
  const chains = buildChains(records);
  const marks = cleanMarks(rawMarks);
  const out = { ref, delays: [], coverage: {}, unmatched: { taps: [], steps: [] }, stats: {}, statsLowConfidence: {}, clock: clockCheck(records), warnings: [] };
  const feeds = new Set();
  for (const steps of chains.values()) for (const s of steps) for (const src of s.obs.keys()) feeds.add(src);

  for (const [game, steps] of chains) {
    // Missed steps per feed: steps after the feed's first observed state that it never showed.
    for (const f of feeds) {
      const seen = steps.filter((s) => s.obs.has(f));
      if (!seen.length) continue;
      const firstIdx = steps.indexOf(seen[0]);
      const expected = steps.slice(firstIdx);
      const c = (out.coverage[f] ??= { steps: 0, observed: 0, missed: 0 });
      c.steps += expected.length;
      c.observed += expected.filter((s) => s.obs.has(f)).length;
      c.missed += expected.filter((s) => !s.obs.has(f)).length;
    }
    const taps = (kind) => marks.filter((m) => m.kind === kind && m.game === game && (m.team === 'away' || m.team === 'home')).map((m) => ({ ...m }));
    const real = alignTaps(taps('real'), steps, windowMs);
    const truth = alignTaps(taps('truth'), steps, windowMs);
    const truthBy = new Map(truth.pairs.map((p) => [p.step.key, p]));
    const realBy = new Map(real.pairs.map((p) => [p.step.key, p]));
    for (const [k, list] of [['real', real], ['truth', truth]]) {
      out.unmatched.taps.push(...list.unmatchedTaps.map((t) => ({ game, kind: k, team: t.team, at: t.at })));
      if (k === 'real' || truth.pairs.length) out.unmatched.steps.push(...list.unmatchedSteps.map((s) => ({ game, kind: k, key: s.key, team: s.team })));
    }
    if (real.pairs.length || taps('real').length) { const c = (out.coverage.real ??= { steps: 0, observed: 0, missed: 0 }); c.steps += steps.filter((s) => s.team === 'away' || s.team === 'home').length; c.observed += real.pairs.length; c.missed += real.unmatchedSteps.length; }

    for (const s of steps) {
      const live = [...s.obs].filter(([, o]) => !o.baseline);
      let r = null;
      if (ref === 'truth') { const t = truthBy.get(s.key); r = t ? { prevPollAt: t.tap.at - HUMAN_MS, seenAt: t.tap.at + HUMAN_MS } : null; }
      else if (ref === 'fastest') r = live.map(([, o]) => o).sort((x, y) => mid(x) - mid(y))[0] ?? null;
      else r = s.obs.get(ref) && !s.obs.get(ref).baseline ? s.obs.get(ref) : null;
      if (!r) continue;
      for (const [src, o] of live) {
        if (src === ref) continue;
        out.delays.push({ game, key: s.key, src, delayMs: Math.round(mid(o) - mid(r)), uncertaintyMs: Math.round(half(o) + half(r)), confidence: 'exact' });
      }
      const rp = realBy.get(s.key);
      if (rp && ref !== 'real') {
        const o = { prevPollAt: rp.tap.at - HUMAN_MS, seenAt: rp.tap.at + HUMAN_MS };
        out.delays.push({ game, key: s.key, src: 'real', delayMs: Math.round(mid(o) - mid(r)), uncertaintyMs: Math.round(half(o) + half(r)), confidence: rp.confidence });
      }
    }
  }

  for (const src of new Set(out.delays.map((d) => d.src))) {
    const ds = out.delays.filter((d) => d.src === src);
    out.stats[src] = stats(ds.filter((d) => d.confidence !== 'low'));
    const low = ds.filter((d) => d.confidence === 'low');
    if (low.length) out.statsLowConfidence[src] = stats(low);
    if (!out.stats[src]) delete out.stats[src];
  }
  for (const c of Object.values(out.coverage)) c.missedRate = c.steps ? +(c.missed / c.steps).toFixed(3) : null;
  if (out.clock.offsetMs != null && Math.abs(out.clock.offsetMs) > 2000) out.warnings.push(`this machine's clock is ~${(out.clock.offsetMs / 1000).toFixed(1)}s off the servers' Date headers: fix time sync (relative delays are unaffected, but any comparison with provider timestamps is not)`);
  const far = out.delays.filter((d) => Math.abs(d.delayMs) > OUTLIER_MS);
  if (far.length) out.warnings.push(`${far.length} pair(s) differ by more than ${OUTLIER_MS / 1000}s (${[...new Set(far.map((d) => d.src))].join(', ')}): check for a wrong alignment or a genuinely slow/fast observer before trusting the medians`);
  if (out.clock.offsetMs == null) out.warnings.push('too few uncached responses with a Date header to check the clock');
  for (const [src, v] of Object.entries(out.stats)) if (v.n < 30) out.warnings.push(`${src}: only ${v.n} paired changes; the acceptance test needs at least 30 (and 3 sports)`);
  return out;
}

export function toMarkdown(r) {
  const f = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
  const L = [`Reference: **${r.ref}**. Delay = when the source showed the change minus the reference (positive = later). ± = both observations' windows combined. Headline rows exclude low-confidence tap pairs.`, '', '| source | n | median | p90 | max | min | ± |', '|---|---|---|---|---|---|---|'];
  for (const [s, v] of Object.entries(r.stats).sort((a, b) => a[1].medianMs - b[1].medianMs)) L.push(`| ${s} | ${v.n} | ${f(v.medianMs)} | ${f(v.p90Ms)} | ${f(v.maxMs)} | ${f(v.minMs)} | ${f(v.medianUncertaintyMs)} |`);
  if (Object.keys(r.statsLowConfidence).length) {
    L.push('', 'Low-confidence tap pairs (another same-team step was almost as near; reported apart):', '', '| source | n | median | p90 | ± |', '|---|---|---|---|---|');
    for (const [s, v] of Object.entries(r.statsLowConfidence)) L.push(`| ${s} | ${v.n} | ${f(v.medianMs)} | ${f(v.p90Ms)} | ${f(v.medianUncertaintyMs)} |`);
  }
  L.push('', '**Coverage / missed events** (steps after each observer\'s first sight)', '', '| observer | steps | seen | missed | missed rate |', '|---|---|---|---|---|');
  for (const [s, c] of Object.entries(r.coverage)) L.push(`| ${s} | ${c.steps} | ${c.observed} | ${c.missed} | ${c.missedRate == null ? '–' : (c.missedRate * 100).toFixed(1) + '%'} |`);
  if (r.unmatched.taps.length) L.push('', `Unmatched taps (${r.unmatched.taps.length}): ${r.unmatched.taps.slice(0, 12).map((t) => `${t.game} ${t.kind}/${t.team}@${new Date(t.at).toISOString().slice(11, 19)}`).join('; ')}`);
  L.push('', `Clock check: ${r.clock.offsetMs == null ? 'not enough samples' : `local − server ≈ ${(r.clock.offsetMs / 1000).toFixed(1)}s ± ${(r.clock.halfWidthMs / 1000).toFixed(1)}s (n=${r.clock.n})`}`);
  for (const w of r.warnings) L.push(`⚠ ${w}`);
  return L.join('\n');
}

// CLI: node analyze.mjs <out-dir> [--ref fastest|truth|<feed>] [--window 45000]
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { readFileSync, existsSync } = await import('node:fs');
  const dir = process.argv[2];
  const opt = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d);
  const read = (f) => (existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const records = [...read('changes.jsonl'), ...read('polls.jsonl')];
  console.log(toMarkdown(compare(records, read('marks.jsonl'), { ref: opt('ref', 'fastest'), windowMs: Number(opt('window', WINDOW_MS)) })));
}
