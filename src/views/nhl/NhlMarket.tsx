// The NHL research layer on a market page: why a contract is (or is not) interesting. Summary first (fair
// probability, the side's executable price, survival, robustness, research status), then its behaviour in every
// game script with the failure script called out, then the model evidence and the family's calibration record.
// Unsupported contracts say "Model does not price this market" and keep their live quote above.
import { Link } from 'react-router';
import type { EventResearchDoc, Market } from '../../contract/types';
import { Stratum } from '../../components/ui';
import { centsText, evAt, evText, isNhlScripts, probText, readNhl, sideProbabilities, survivalText, TIER_HELP } from '../../lib/nhl';
import { routes } from '../../lib/routes';
import { lowerLabel, ResearchOnly, ScriptDot, StatusChip, TierChip } from './parts';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function NhlMarketResearch({ r, m, slug }: { r: EventResearchDoc | null | undefined; m: Market; slug: string }) {
  const s = readNhl(r);
  const cal = ((r?.extensions as any)?.family_calibration ?? {})[m.market_family];
  if (!s) return null;
  if (!isNhlScripts(s)) {
    return (
      <Stratum n="02" title="NHL research" sub="Scripts, survival and research status">
        <p className="muted">{s.reason}. No script-conditioned price is shown for this market.</p>
      </Stratum>
    );
  }
  const row = s.markets.get(m.kalshi_ticker);
  if (!row) {
    const why = s.unpriced.find((u) => u.ticker === m.kalshi_ticker)?.reason;
    return (
      <Stratum n="02" title="NHL research" sub="Scripts, survival and research status">
        <p><b>Model does not price this market.</b> {why ? `Reason: ${why}.` : 'Its family is not simulated by the NHL model.'} The live quote above is unaffected; no model price is invented.</p>
      </Stratum>
    );
  }
  const cands = s.candidates.filter((c) => c.ticker === m.kalshi_ticker);
  const sides = (['yes', 'no'] as const).map((side) => ({ side, sd: side === 'yes' ? row.yes : row.no, p: sideProbabilities(row, side), ev: evAt(row, side, (side === 'yes' ? row.yes : row.no)?.cost ?? null), cand: cands.find((c) => c.side === side) }));
  const idx = (id: string) => s.order.indexOf(id);
  const failOf = (id: string | null) => (id ? s.byId.get(id) : undefined);
  return (
    <Stratum n="02" title="NHL research: does it survive the game scripts?" sub={<>From the NHL joint simulation at the research run{s.generatedAt ? ` (${s.generatedAt.slice(0, 16).replace('T', ' ')} UTC)` : ''} · <ResearchOnly /></>}>
      <div className="pxgrid">
        <div className="px"><span className="px__k">Model P(YES)</span><b className="px__v num">{probText(row.pYes, 1)}</b><span className="px__s">joint simulation, {s.nDraws.toLocaleString('en-US')} games</span></div>
        <div className="px"><span className="px__k">Market P(YES)</span><b className="px__v num">{probText(row.pYesMid, 1)}</b><span className="px__s">Kalshi mid at the run</span></div>
        {sides.map(({ side, sd }) => (
          <div className="px" key={side}>
            <span className="px__k">{side.toUpperCase()} at {centsText(sd?.ask)}</span>
            <b className="px__v num">{evText(sd?.ev)}</b>
            <span className="px__s">{sd ? <>{survivalText(sd.mass, sd.survives, s.order.length).replace(/^Survives /, 'survives ')} · <TierChip tier={sd.tier} /></> : 'no executable ask'}</span>
          </div>
        ))}
      </div>
      {cands.map((c) => (
        <div key={c.bet_id} className="nunav" role="note">
          <b>Research candidate ({c.side.toUpperCase()}):</b> fair {probText(c.p_model, 1)}, conservative {probText(c.p_conservative, 1)}, edge after fee {evText(c.ev_adjusted)}, bet up to {centsText(c.bet_up_to_cents)} · <TierChip tier={c.robustness} /> <StatusChip status={c.governance.status} />
          {c.governance.reasons.length > 0 && <span className="muted"> · {c.governance.reasons.map((x) => x.replace(/_/g, ' ').toLowerCase()).join('; ')}</span>}
          {failOf(c.survival.failure_script) && <> · fails mainly if <b>{lowerLabel(failOf(c.survival.failure_script)!.label)}</b></>}
          <span className="muted"> · {c.governance.stake_kind}</span>
          <div className="small"><Link to={routes.game(slug, r!.event.event_id, { tab: 'candidates' })}>Why, with the evidence for and against →</Link></div>
        </div>
      ))}
      <h3 className="nfsec__h">Behaviour in every script</h3>
      <div className="tscroll" tabIndex={0} role="region" aria-label="Script-conditioned prices">
        <table className="nsc__t">
          <thead>
            <tr><th scope="col">Script</th><th scope="col" className="r">Share</th><th scope="col" className="r">P(YES)</th><th scope="col" className="r">YES EV</th><th scope="col" className="r">NO EV</th></tr>
          </thead>
          <tbody>
            {s.scripts.map((x) => {
              const i = idx(x.id);
              return (
                <tr key={x.id}>
                  <th scope="row"><ScriptDot tone={x.tone} />{x.label}</th>
                  <td className="r num">{probText(x.probability)}</td>
                  <td className="r num">{probText(sides[0].p[i], 1)}</td>
                  {sides.map(({ side, sd, ev }) => <td key={side} className={`r num ${sd?.survives?.[i] ? 'nmx__v--yes' : 'nmx__v--no'}`}>{evText(ev[i])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">EV per $1 contract at the research run's ask after Kalshi fees and the conservative haircut. {TIER_HELP.ROBUST}</p>
      {sides.map(({ side, sd }) => failOf(sd?.failure ?? null) && (
        <p key={side} className="small"><b>{side.toUpperCase()} fails mainly if:</b> {lowerLabel(failOf(sd!.failure)!.label)}.</p>
      ))}
      {cal && (
        <>
          <h3 className="nfsec__h">This market family's record</h3>
          <p className="small">
            {cal.v1_n ? <>DATA_ONLY_V1 Brier {Number(cal.v1_brier).toFixed(4)} vs market {Number(cal.market_brier_same_rows ?? cal.market_brier).toFixed(4)} on {Number(cal.v1_n).toLocaleString('en-US')} settled pregame rows (many rows per game; correlated); mean CLV {evText(cal.clv_mean)}. </> : <>No DATA_ONLY_V1 calibration rows for this family; the market's own Brier is {cal.market_brier != null ? Number(cal.market_brier).toFixed(4) : '—'}. </>}
            Authority {String(cal.current_authority).replace(/_/g, ' ').toLowerCase()}.
          </p>
        </>
      )}
    </Stratum>
  );
}
