// THE CHAIN CARD — one matchup mismatch followed to its markets (src/intelligence/chain.ts), as numbered links:
// matchup → scheme → player → game scripts → markets (with the opportunity layer's call) → counterargument → survival.
// Every link says when the publication carries nothing for it. The card never shows a bet the opportunity layer did not make.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { FxCard } from '../../components/fx';
import { Icon } from '../../components/Icon';
import type { IntelChain, Judgment } from '../../intelligence/chain';
import { judgmentWords } from '../../intelligence/chain';
import { formatQuoteAgo, quoteAgeMs } from '../../live/freshness';
import { routes } from '../../lib/routes';
import { sharePct } from '../../lib/scripts';
import './chain.css';

const cents = (v: number) => `${Math.round(v * 100)}¢`;
const VERDICT = { supports: 'Leans with', against: 'Cuts against', neutral: 'No lean' } as const;

function Call({ j }: { j: Judgment }) {
  if (j.kind === 'opportunity' || j.kind === 'opposite') return <span className={`dword dword--${j.tone}`}>{j.kind === 'opposite' ? `Other side · ${j.word}` : j.word}</span>;
  return <span className="ich__nc">{j.kind === 'model-only' ? 'Not a candidate' : 'No model price'}</span>;
}

function Step({ n, k, children }: { n: number; k: string; children: ReactNode }) {
  return (
    <li className="ich__s">
      <span className="ich__n" aria-hidden="true">{n}</span>
      <div className="ich__b"><h3 className="ich__k">{k}</h3>{children}</div>
    </li>
  );
}

export function ChainCard({ c, slug, eventId, now, loading }: { c: IntelChain | null; slug: string; eventId: string; now: number; loading?: boolean }) {
  return (
    <FxCard title="From matchup to market" icon="layers" id="tm-ch" className="tm-p tm-p--ch" action={{ to: routes.game(slug, eventId, { tab: 'script' }), label: 'Scripts' }}>
      {!c ? <p className="tm-none"><Icon name="info" size={14} /> {loading ? 'Reading this game’s markets and scripts…' : 'This game’s markets could not be read, so the chain stops at the matchup.'}</p> : (
        <ol className="ich" aria-label="Matchup to market chain">
          <Step n={1} k="Matchup">
            <p className="ich__p"><b>{c.matchup.offense}</b> vs <b>{c.matchup.defense}</b> · {c.matchup.size} edge to the {c.matchup.beneficiary}.</p>
            <p className="ich__sub">{c.matchup.indicates}</p>
          </Step>
          <Step n={2} k="Scheme">
            {c.scheme ? <><p className="ich__p">{c.scheme.text} <span className="ich__sub">({c.scheme.sample})</span></p><p className="ich__sub">Observation only: charted by FTN via nflverse, it does not move the projection.</p></> : <p className="ich__sub">{c.schemeNote}</p>}
          </Step>
          <Step n={3} k="Player">
            {c.player ? (
              <p className="ich__p">
                <Link to={routes.player(slug, c.player.pid)}>{c.player.name}</Link>{c.player.role ? ` (${c.player.role}, ${c.player.team})` : ` (${c.player.team})`}: the matchup leans toward <b>{c.player.effect === 'up' ? 'more' : 'fewer'}</b> {c.player.statWord}.
                {c.player.projection && <span className="ich__sub"> Publication projection {Math.round(c.player.projection.mean)}{c.player.projection.typical ? `, typical ${Math.round(c.player.projection.typical[0])}–${Math.round(c.player.projection.typical[1])}` : ''} (simulation, research only).</span>}
              </p>
            ) : <p className="ich__sub">{c.playerNote}</p>}
          </Step>
          <Step n={4} k="Game scripts">
            {c.scripts ? (
              <>
                <ul className="ich__sc">
                  {c.scripts.list.map((s) => (
                    <li key={s.id} className={`ich__sr ich__sr--${s.verdict}`}>
                      <span className="ich__sn">{s.name}</span>
                      <span className="ich__ss fx-num">{sharePct(s.share)}</span>
                      <span className="ich__sv">{VERDICT[s.verdict]}{s.lean != null && s.verdict !== 'neutral' ? ` · ${s.lean > 0 ? '+' : '−'}${Math.round(Math.abs(s.lean) * 100)}%` : ''}</span>
                    </li>
                  ))}
                </ul>
                <p className="ich__sub">{c.scripts.team} {c.scripts.volWord} in each simulated script against all simulated games; a 5% move is a lean. Shares are the simulator’s, not calibrated odds{c.scripts.tie != null ? `; ties after overtime ${(c.scripts.tie * 100).toFixed(1)}%` : ''}.</p>
              </>
            ) : <p className="ich__sub">{c.scriptNote}</p>}
          </Step>
          <Step n={5} k="Markets and the price">
            {c.markets.length ? (
              <ul className="ich__mk">
                {c.markets.map((m) => (
                  <li key={m.marketId + m.side} className="ich__m">
                    <div className="ich__mh">
                      <Link to={routes.market(slug, m.marketId, eventId)} className="ich__ml">{m.side === 'NO' ? 'NO · ' : ''}{m.label}</Link>
                      <span className="ich__ma"><b className="fx-num tm-gold">{cents(m.ask)}</b> <small>{m.side} ask{m.at ? ` · ${formatQuoteAgo(quoteAgeMs(m.at, now))}` : ''}</small></span>
                      <Call j={m.judgment} />
                    </div>
                    <p className="ich__sub">{m.why} {m.survival}.</p>
                    <p className="ich__sub ich__j">{judgmentWords(m.judgment)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="ich__sub">{c.marketNote}</p>}
          </Step>
          <Step n={6} k="Strongest counterargument">
            <p className="ich__p ich__ctr">{c.counter.text}</p>
          </Step>
          <Step n={7} k="Across scripts">
            <p className="ich__p"><span className={`ich__badge${c.survives.multi ? ' is-multi' : ''}`}>{c.survives.multi ? 'Survives several scripts' : c.scripts && c.scripts.supportCount === 0 ? 'No supporting script' : 'Rests on one script'}</span> {c.survives.text}</p>
          </Step>
        </ol>
      )}
      <p className="tm-note">Whether a price justifies a bet is the opportunity layer’s call alone; a matchup, a scheme tendency or a script share never makes one.</p>
    </FxCard>
  );
}
