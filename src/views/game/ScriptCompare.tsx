// SCRIPT COMPARISON STUDIO — two of the game's simulated scripts side by side: their simulation share (labelled as
// a share of simulated games, never a calibrated probability), the final margin that defines each, each team's
// conditional volume (plays, pass and rush attempts, pass rate) against its all-games average, and the priced
// contracts that win in one script but not the other. Every number is the publication's; nothing is adjusted.
// Phones stack the two columns.
import { useState } from 'react';
import type { PriceRow } from '../../lib/gamedata';
import { sharePct, type ScriptSet, type TeamVolume } from '../../lib/scripts';

const n0 = (v: number | null) => (v == null ? '—' : String(Math.round(v)));
const pc = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const c = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

function delta(v: number | null, base: number | null, pct = false): string {
  if (v == null || base == null) return '';
  const d = v - base;
  if (Math.abs(d) < (pct ? 0.005 : 0.5)) return 'avg';
  return `${d > 0 ? '+' : '−'}${pct ? Math.round(Math.abs(d) * 100) + ' pts' : Math.round(Math.abs(d))}`;
}

export function ScriptCompare({ set, rows }: { set: ScriptSet; rows: PriceRow[] }) {
  const byShare = [...set.scripts].sort((a, b) => b.share - a.share);
  const [aId, setA] = useState(byShare[0]?.id);
  const [bId, setB] = useState(byShare[1]?.id ?? byShare[0]?.id);
  const a = set.scripts.find((s) => s.id === aId) ?? byShare[0];
  const b = set.scripts.find((s) => s.id === bId) ?? byShare[1] ?? byShare[0];
  if (!a || !b) return null;
  const ia = set.scripts.indexOf(a);
  const ib = set.scripts.indexOf(b);
  const priced = rows.filter((x) => x.fit && x.ask != null && x.ask > 0.03 && x.ask < 0.97);
  const onlyIn = (i: number, j: number) => priced.filter((x) => x.fit!.fits[i] === 'yes' && x.fit!.fits[j] === 'no').sort((p, q) => (q.ask ?? 0) - (p.ask ?? 0)).slice(0, 4);
  const vol = (k: keyof TeamVolume, side: 'home' | 'away', s: typeof a) => s.volume[side][k];
  const rowsV: { label: string; k: keyof TeamVolume; pct?: boolean }[] = [
    { label: 'Plays', k: 'plays' }, { label: 'Pass attempts', k: 'passAtt' }, { label: 'Rush attempts', k: 'rushAtt' }, { label: 'Pass rate', k: 'passRate', pct: true },
  ];
  const Col = ({ s, i, other }: { s: typeof a; i: number; other: number }) => (
    <div className={`scmp__col scmp__col--s${s.index}`}>
      <span className="scmp__share bnum">{sharePct(s.share)}<small> of simulated games</small></span>
      <p className="scmp__story">{s.story}</p>
      <table className="lab__t scmp__t">
        <thead><tr><th scope="col">Volume</th><th scope="col">{set.awayAbbr}</th><th scope="col">{set.homeAbbr}</th></tr></thead>
        <tbody>
          {rowsV.map((r) => (
            <tr key={r.k}>
              <th scope="row">{r.label}</th>
              {(['away', 'home'] as const).map((side) => <td key={side} className="bnum">{r.pct ? pc(vol(r.k, side, s)) : n0(vol(r.k, side, s))} <small className="muted">{delta(vol(r.k, side, s), set.overall[side][r.k], r.pct)}</small></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="scmp__mk">
        <span className="eyebrow2">Wins here, loses in the other</span>
        {onlyIn(i, other).length ? <ul>{onlyIn(i, other).map((x) => <li key={x.m.market_id}>{x.label} <span className="muted">· YES {c(x.ask)}</span></li>)}</ul> : <p className="muted small">No priced margin contract separates these two scripts.</p>}
      </div>
    </div>
  );
  return (
    <section className="glass scmp" aria-labelledby="scmp-h">
      <h2 className="tpanel__h" id="scmp-h">Script Comparison Studio</h2>
      <div className="scmp__pick">
        <label className="term__sel"><span>Script A</span><select value={a.id} onChange={(e) => setA(e.target.value as typeof a.id)}>{byShare.map((s) => <option key={s.id} value={s.id}>{s.name} · {sharePct(s.share)}</option>)}</select></label>
        <label className="term__sel"><span>Script B</span><select value={b.id} onChange={(e) => setB(e.target.value as typeof b.id)}>{byShare.map((s) => <option key={s.id} value={s.id}>{s.name} · {sharePct(s.share)}</option>)}</select></label>
      </div>
      <div className="scmp__cols">
        <Col s={a} i={ia} other={ib} />
        <Col s={b} i={ib} other={ia} />
      </div>
      <p className="tpanel__note">Shares are the simulation’s share of games ending that way, not calibrated probabilities. Volumes are the simulation’s averages in games that ended that way; the small figure is the change against all simulated games. {set.notSimulated.length ? `Not simulated: ${set.notSimulated.slice(0, 3).join('; ')}.` : ''}</p>
    </section>
  );
}
