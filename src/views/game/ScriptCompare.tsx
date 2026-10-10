// SCRIPT COMPARISON (approved reference 05) — two of the game's simulated scripts side by side: their simulation share
// (labelled as a share of simulated games, never a calibrated probability), the final margin that defines each, where
// each ends on the margin axis over the simulation's published bands, each team's conditional volume (plays, pass and
// rush attempts, pass rate) against its all-games average, the key players' team-volume lean in each, and the priced
// contracts that win in one script but not the other. Every number is the publication's; nothing is adjusted. The pair
// lives in the address (?view=compare&a=…&b=…), so a comparison is shareable. Phones get a focused stacked view.
import { Link, useSearchParams } from 'react-router';
import type { EventResearchDoc } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { PlayerFace } from '../../components/insight';
import { MarginMap } from '../../components/fxResearch';
import type { PriceRow } from '../../lib/gamedata';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { sharePct, type GameScript, type ScriptId, type ScriptSet } from '../../lib/scripts';
import { teamColors } from '../../lib/teams';
import { keyPlayers, marginBand, rangeText, scriptSegs, TheaterCards, VOL } from './ScriptTab';

const c = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

function Bar({ v, max, tone }: { v: number | null; max: number; tone: number }) {
  return <span className={`fr-cmpbar fr-cmpbar--s${tone}`} aria-hidden="true"><i style={{ width: `${v == null || !max ? 0 : Math.max(3, Math.min(100, (v / max) * 100))}%` }} /></span>;
}

export function ScriptCompareStudio({ r, set, rows, slug }: { r: EventResearchDoc; set: ScriptSet; rows: PriceRow[]; slug: string }) {
  const [sp, setSp] = useSearchParams();
  const byShare = [...set.scripts].sort((x, y) => y.share - x.share);
  const pick = (k: string, fallback: GameScript | undefined) => set.scripts.find((s) => s.id === sp.get(k)) ?? fallback;
  const a = pick('a', byShare[0]);
  let b = pick('b', byShare[1] ?? byShare[0]);
  if (a && b && a.id === b.id) b = byShare.find((s) => s.id !== a.id) ?? b;
  if (!a || !b) return null;
  const setPair = (na: ScriptId, nb: ScriptId) => setSp((p) => { const n = new URLSearchParams(p); n.set('view', 'compare'); n.set('a', na); n.set('b', nb); return n; }, { replace: true });
  const onPick = (id: ScriptId) => { if (id === a.id || id === b.id) return; setPair(a.id, id); };
  const ia = set.scripts.indexOf(a);
  const ib = set.scripts.indexOf(b);
  const priced = rows.filter((x) => x.fit && x.ask != null && x.ask > 0.03 && x.ask < 0.97);
  const onlyIn = (i: number, j: number) => priced.filter((x) => x.fit!.fits[i] === 'yes' && x.fit!.fits[j] === 'no').sort((p, q) => (q.ask ?? 0) - (p.ask ?? 0)).slice(0, 4);
  const players = keyPlayers(r, set).slice(0, 6);
  const sides = [['away', set.awayAbbr], ['home', set.homeAbbr]] as const;
  const Head = ({ s, tag }: { s: GameScript; tag: string }) => (
    <div className={`fr-cmp__head fr-cmp__head--s${s.index}`}>
      <span className="fr-cmp__tag">{tag}</span>
      <b className="fr-cmp__name">{s.name}</b>
      <span className="fr-cmp__pct"><b className="fx-num">{sharePct(s.share)}</b> of simulated games</span>
      <span className="fr-cmp__need">{rangeText(s, set)}</span>
    </div>
  );
  return (
    <section className="fr-cmp" aria-labelledby="scmp-h">
      <h3 className="fr-k fr-th__pick" id="scmp-h">Compare two scripts</h3>
      <TheaterCards r={r} set={set} current={[a.id, b.id]} onPick={onPick} marks={{ [a.id]: 'A', [b.id]: 'B' }} />
      <div className="fr-cmp__pickers">
        {(['a', 'b'] as const).map((k) => {
          const cur = k === 'a' ? a : b;
          const other = k === 'a' ? b : a;
          return (
            <div key={k} className="fr-cmp__picker" role="group" aria-label={`Script ${k.toUpperCase()}`}>
              <span className="fr-k">Script {k.toUpperCase()}</span>
              <div className="fr-chips">
                {byShare.map((s) => (
                  <button key={s.id} type="button" className={`fr-chip fr-chip--s${s.index}${cur.id === s.id ? ' is-on' : ''}`} aria-pressed={cur.id === s.id} disabled={s.id === other.id} onClick={() => (k === 'a' ? setPair(s.id, b.id) : setPair(a.id, s.id))}>{s.name}</button>
                ))}
              </div>
            </div>
          );
        })}
        <button type="button" className="btn btn--sm fr-cmp__swap" onClick={() => setPair(b.id, a.id)}><Icon name="compare" size={15} /> Swap</button>
      </div>

      <div className="fx-bento">
        <div className="fx-card fx-span-7 fr-cmp__grid">
          <div className="fr-cmp__heads">
            <Head s={a} tag="A" />
            <span className="fr-cmp__vs" aria-hidden="true">VS</span>
            <Head s={b} tag="B" />
          </div>
          <table className="fr-t fr-cmp__t">
            <caption className="sr-only">{a.name} against {b.name}: simulated volume by team</caption>
            <thead><tr><th scope="col">Simulated</th><th scope="col" className="r">{a.name}</th><th scope="col" className="r">{b.name}</th></tr></thead>
            <tbody>
              <tr>
                <th scope="row">Share of simulated games</th>
                <td className="r"><span className="fx-num">{sharePct(a.share)}</span><Bar v={a.share} max={1} tone={a.index} /></td>
                <td className="r"><span className="fx-num">{sharePct(b.share)}</span><Bar v={b.share} max={1} tone={b.index} /></td>
              </tr>
              {sides.flatMap(([side, ab]) => VOL.map((v) => {
                const va = a.volume[side][v.k];
                const vb = b.volume[side][v.k];
                const max = Math.max(va ?? 0, vb ?? 0) * (v.pct ? 1 : 1.15);
                return (
                  <tr key={`${side}${v.k}`}>
                    <th scope="row">{ab} {v.label.toLowerCase()}</th>
                    <td className="r"><span className="fx-num">{va != null ? v.fmt(va) : '—'}</span><Bar v={va} max={max} tone={a.index} /></td>
                    <td className="r"><span className="fx-num">{vb != null ? v.fmt(vb) : '—'}</span><Bar v={vb} max={max} tone={b.index} /></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
          <p className="fr-note">Volumes are the simulation’s averages in games that end each way. Projected scores and win chances by script are not published, so they are not shown.</p>
        </div>

        <div className="fx-card fx-span-5">
          <h3 className="fx-card__t"><Icon name="chart" size={16} /> How the game ends</h3>
          <MarginMap segs={scriptSegs(set, [a.id, b.id], true)} band={marginBand(r)} homeAbbr={set.homeAbbr} awayAbbr={set.awayAbbr} label={`Final margins of ${a.name} and ${b.name}`} />
          <p className="fr-note">Score-state paths are not simulated: this is where each script ends on the final margin, over the simulation’s published margin range.</p>
        </div>

        <div className="fx-card fx-span-7">
          <h3 className="fx-card__t"><Icon name="star" size={16} /> Key player impacts <small className="fr-k">team volume, A vs B</small></h3>
          <ul className="fr-cmp__players">
            {players.map((p) => {
              const va = a.volume[p.side][p.vol];
              const vb = b.volume[p.side][p.vol];
              const d = va != null && vb != null && va ? (vb - va) / va : null;
              return (
                <li key={p.pid}>
                  <Link to={routes.player(slug, p.pid)} className="fr-cmp__pl" style={{ ['--tc' as string]: teamColors('NFL', p.abbr)[0] }}>
                    <PlayerFace photo={playerPhoto(p.pid, p.name, p.abbr)} team={p.abbr} size="sm" />
                    <span className="fr-pimp__id"><b>{p.name}</b><small>{p.role} · {p.abbr} · {p.volLabel.toLowerCase()}</small></span>
                    <span className={`fr-cmp__pv fr-cmp__pv--s${a.index}`}><b className="fx-num">{va != null ? va.toFixed(1) : '—'}</b><small>A</small></span>
                    <span className={`fr-cmp__pv fr-cmp__pv--s${b.index}`}><b className="fx-num">{vb != null ? vb.toFixed(1) : '—'}</b><small>B</small></span>
                    <span className={`fr-d fr-d--${d == null || Math.abs(d) < 0.03 ? 'flat' : d > 0 ? 'up' : 'down'}`}>{d == null ? '—' : Math.abs(d) < 0.03 ? '≈' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="fr-note">The publication does not split player projections by script; the change is his team’s volume from A to B.</p>
        </div>

        <div className="fx-card fx-span-5">
          <h3 className="fx-card__t"><Icon name="layers" size={16} /> Markets that separate them</h3>
          <div className="fr-cmp__mk">
            {([[a, ia, ib, 'A'], [b, ib, ia, 'B']] as const).map(([s, i, j, tag]) => (
              <div key={tag} className={`fr-cmp__mkc fr-cmp__mkc--s${s.index}`}>
                <span className="fr-cmp__mkh"><span className="fr-cmp__tag">{tag}</span> Wins in {s.name}, loses in the other</span>
                {onlyIn(i, j).length ? <ul>{onlyIn(i, j).map((x) => <li key={x.m.market_id}><Link to={routes.market(slug, x.m.market_id, x.m.event_id ?? '')}>{x.label}</Link> <span className="fx-num">YES {c(x.ask)}</span></li>)}</ul> : <p className="fr-note">No priced margin contract separates these two scripts this way.</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="fr-note">Shares are the simulation’s share of games ending that way, not calibrated probabilities. {set.notSimulated.length ? `Not simulated: ${set.notSimulated.slice(0, 3).join('; ')}.` : ''}</p>
    </section>
  );
}
