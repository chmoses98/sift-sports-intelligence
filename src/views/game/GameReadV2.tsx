// The CFB Script Engine V2 game read (cfb-script-engine/2.0.0, `claims_v2`): independent football claims —
// control (side + strength), closeness, pace, scoring environment, defensive suppression, disruption — shown
// as one synthesized sentence over compact chips, with the CONTROL tier's historical empirical range and every
// claim's own statement one click down. While the publication marks V2 as SHADOW the V1 scripts stay the
// active read and this panel says it is a preview.
//
// Words are chosen so nothing reads as a probability: the range is a "historical empirical range" of past
// games, the historical result is a count ("N of M such games"), never a percentage or a chance.
import type { ReactNode } from 'react';
import {
  PACE_WORD,
  SCORING_WORD,
  STRENGTH_WORD,
  historicalWinsText,
  rangeText,
  seasonsText,
  signedPoints,
  type ClaimsV2,
  type Engine,
} from '../../lib/scriptEngine';
import { Info } from './panels';

function Chip({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <li className={`v2chip${tone ? ` v2chip--${tone}` : ''}`}>
      <span className="v2chip__k">{k}</span>
      <span className="v2chip__v">{v}</span>
    </li>
  );
}

export function GameReadV2Panel({ engine }: { engine: Engine }) {
  const v2 = engine.claimsV2 as ClaimsV2;
  const c = v2.claims;
  const name = (side: 'home' | 'away') => engine.teams[side]?.name ?? side;
  const control = c.control;
  const range = control?.historical_range ?? null;
  const shadow = v2.activation === 'SHADOW';
  const statements = [
    control && { k: 'Control', t: control.statement },
    c.closeness && { k: 'Closeness', t: c.closeness.statement },
    c.pace && { k: 'Pace', t: c.pace.statement },
    c.scoring_environment && { k: 'Scoring environment', t: c.scoring_environment.statement },
    c.defensive_suppression && { k: 'Defensive suppression', t: c.defensive_suppression.statement },
    ...c.disruption.map((d) => ({ k: `Disruption edge · ${name(d.side)}`, t: d.statement })),
  ].filter((x): x is { k: string; t: string } => !!x);

  return (
    <section className="panel eng-v2" aria-labelledby="eng-v2-h" data-testid="game-read-v2">
      <div className="phead">
        <h2 className="phead__t" id="eng-v2-h">
          Game Read
          <Info label="How the V2 game read is built">
            Independent football claims, each read from the same frozen, market-blind football findings as the scripts.
            The sentence is assembled from those claims and adds nothing to them. No combination is a separately
            calibrated scenario, and nothing here is a probability, a fair price or an expected value.
          </Info>
        </h2>
        {shadow && <span className="rchip" title="Published beside the active V1 scripts while V2 is reviewed">V2 preview</span>}
      </div>

      <p className="ov-model__read eng-v2__story">{v2.story.headline}</p>

      {v2.status === 'NO_SUPPORTED_CLAIM' ? (
        <p className="small muted">
          The current evidence taxonomy did not authorize a claim for this game. That does not mean the game is unusually
          unpredictable.
        </p>
      ) : (
        <ul className="v2chips" aria-label="Football claims">
          {control && <Chip k="Control" v={`${name(control.side)} · ${STRENGTH_WORD[control.strength] ?? control.strength}`} tone="control" />}
          {c.closeness && <Chip k="Closeness" v="Close-game profile" />}
          {c.pace && <Chip k="Pace" v={PACE_WORD[c.pace.level] ?? c.pace.level} />}
          {c.scoring_environment && <Chip k="Scoring environment" v={SCORING_WORD[c.scoring_environment.level] ?? c.scoring_environment.level} />}
          {c.defensive_suppression && <Chip k="Defensive suppression" v="Both defenses" />}
          {c.disruption.map((d) => (
            <Chip key={d.side} k="Disruption edge" v={`${name(d.side)}${d.aligned_with_control ? ' · with control' : ''}`} />
          ))}
          {c.explosive_upset.script_ids.length > 0 && <Chip k="Explosive upset path" v="V1 rule, untested historically" tone="warn" />}
        </ul>
      )}

      {control && range && (
        <div className="v2range" role="group" aria-label="Historical empirical range">
          <h3 className="v2range__h">
            Historical empirical range
            <Info label="What the historical range is">
              {range.not} The ranges were fitted once on {seasonsText(range.development_seasons)} and checked, unchanged, on{' '}
              {seasonsText(range.validation.seasons)} (middle half held {Math.round(range.validation.coverage_50 * 100)} in 100 games,
              middle 80 held {Math.round(range.validation.coverage_80 * 100)} in 100).
            </Info>
          </h3>
          <dl className="v2range__dl">
            <div><dt>Middle half of past games</dt><dd>{rangeText(name(control.side), range.central_50)}</dd></div>
            <div><dt>Middle 80 of 100 past games</dt><dd>{rangeText(name(control.side), range.central_80)}</dd></div>
            <div><dt>Median margin</dt><dd>{signedPoints(range.median)}</dd></div>
            <div><dt>Past games, control side won</dt><dd>{historicalWinsText(range)}</dd></div>
          </dl>
          <p className="small muted v2range__prov">
            {STRENGTH_WORD[control.strength]} {control.side} control games, {seasonsText(range.development_seasons)} (n = {range.n}) ·
            validated {seasonsText(range.validation.seasons)} (n = {range.validation.n}) · calibration {range.calibration_sha256.slice(0, 8)}
          </p>
        </div>
      )}

      {statements.length > 0 && (
        <details className="v2detail">
          <summary>What each claim says</summary>
          <ul className="why__list small">
            {statements.map((s) => <li key={s.k}><b>{s.k}.</b> {s.t}</li>)}
          </ul>
        </details>
      )}

      <p className="eng-read__foot small">
        <span className="rchip">Research only</span> Data confidence {v2.data_quality.level.toLowerCase()} describes evidence quality,
        not how likely a claim is · {v2.methodology_version}
      </p>
    </section>
  );
}
