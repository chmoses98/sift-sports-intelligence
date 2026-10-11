// Hit-rate presentation: a dot per eligible game (over / under / push against TODAY's line) and the sentence
// "7 of 10 over 54.5". History, never a probability: no percentage chance is printed anywhere.
import { hitPhrase, lineText, sampleNote, type HitRate } from '../../history/hitRate';

/** One dot per game, oldest → newest: filled = over, hollow = under, ring with a bar = push. Shape, not colour alone. */
export function HitDots({ h, max = 10 }: { h: HitRate; max?: number }) {
  const games = h.games.slice(-max);
  return (
    <span className="hdots" aria-hidden="true">
      {games.map((g) => <i key={g.row.game_id} className={`hdots__d hdots__d--${g.result}`} />)}
    </span>
  );
}

export function HitSummary({ h, windowName, unit, projection = null }: { h: HitRate; windowName: string; unit: string; projection?: number | null }) {
  if (!h.n) return <p className="hsum2 hsum2--none">No games played in this window.</p>;
  const note = sampleNote(h);
  const vals = h.games.map((g) => g.v);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const r1 = (v: number) => (Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  const where = projection == null ? null
    : projection > Math.max(...vals) ? 'above every game here'
    : projection < Math.min(...vals) ? 'below every game here'
    : projection >= avg ? 'at or above that average' : 'below that average';
  return (
    <div className="hsum2">
      <p className="hsum2__k">
        <span className="hsum2__w">{windowName}</span>
        <b className="hsum2__big"><span className="num">{h.over}</span><span className="hsum2__of"> of </span><span className="num">{h.n}</span></b>
        <span className="hsum2__t">over today’s line of <b className="num">{lineText(h.line)}</b>{unit ? ` ${unit}` : ''}</span>
      </p>
      <p className="hsum2__s">
        <span className="hsum2__chip hsum2__chip--over">▲ {h.over} over</span>
        <span className="hsum2__chip hsum2__chip--under">▼ {h.under} under</span>
        {h.push > 0 && <span className="hsum2__chip hsum2__chip--push">= {h.push} push{h.push > 1 ? 'es' : ''}</span>}
        <HitDots h={h} max={20} />
      </p>
      <p className="hsum2__avg">
        Average <b className="num">{r1(avg)}</b> {unit} · range <span className="num">{r1(Math.min(...vals))}–{r1(Math.max(...vals))}</span>
        {projection != null && where && <> · today’s projection <b className="num">{r1(projection)}</b> is {where}</>}
      </p>
      <p className="hsum2__n">
        n = {h.n} game{h.n === 1 ? '' : 's'} played{note ? ` · ${note}` : ''}. History against today’s line, not a probability.
        <span className="sr-only"> {hitPhrase(h)}.</span>
      </p>
    </div>
  );
}
