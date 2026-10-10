// The broadcast hero's stat strip (approved reference 02): the handful of numbers a game's own publication carries,
// each labelled with where it comes from and how old it is. Nothing here is derived for display:
//
//  - NFL: the SIFT model's projected score, spread and total and its win probability come from
//    extensions.model_view (a research model with its own caveat, shown on hover and in the sub line); the market
//    spread and total from extensions.market_implied (midpoint-inferred, labelled as such); the game-winner prices
//    from the game's own contracts with the quote's age (live overlay where one exists).
//  - CFB: the Script Engine publishes no probability and no projection. The strip shows the published claim or the
//    PRIMARY script (ranked evidence, never a chance), each team's own game-winner ask with its age, and the data
//    confidence the engine states.
//  - Weather only where the publication captured it (indoor games say so).
import type { Market, EventResearchDoc } from '../../contract/types';
import { Ring, StatStrip, type StatItem } from '../../components/fx';
import { Icon } from '../../components/Icon';
import { halfRound, heroNumbers, spreadText } from '../broadcast/numbers';
import { formatQuoteAgo, quoteAgeMs, quoteFreshness } from '../../live/freshness';
import { cfbName } from '../../lib/cfbTeams';
import { isFullGame } from '../../lib/period';
import { scriptTitle, ROLE_WORD, type Engine } from '../../lib/scriptEngine';
import { resolveHero } from '../../lib/hero/resolve';
import { heroInputFromResearch } from '../../lib/hero/input';
import { gameWeather, type GameWeather } from './Hero';

const cents = (v: number) => `${Math.round(v * 100)}¢`;

/** A game-winner contract's YES ask for one participant (NFL: game_winner, CFB: game_moneyline), full game only. */
export function winnerContract(markets: Market[], pid: string): Market | undefined {
  return markets.find((m) => (m.market_family === 'game_winner' || m.market_family === 'game_moneyline') && m.participant_id === pid && (m.period == null || isFullGame(m.period)));
}

/** "live · 2m ago" / "captured 6h 05m ago" / "stale · 3d ago": the quote clock in words for a stat sub line. */
export function priceAge(m: Market, now: number): { text: string; state: string } {
  const state = quoteFreshness(m.captured_at ?? null, now);
  const ago = formatQuoteAgo(quoteAgeMs(m.captured_at ?? null, now));
  const live = (m.source ?? '').toLowerCase().includes('live') || (m as { live?: boolean }).live === true;
  return { text: state === 'UNKNOWN' ? 'update time unknown' : `${state === 'STALE' ? 'stale · ' : live ? 'live · ' : 'captured '}${ago}`, state };
}

function WeatherValue({ wx }: { wx: GameWeather }) {
  if (wx.kind === 'outdoor') {
    return <span className="ghs__wx"><Icon name={wx.icon} size={26} /><span className="fx-num">{wx.temp}°</span></span>;
  }
  return <span className="ghs__wx"><Icon name="dome" size={24} /><span className="ghs__wxw">{wx.condition}</span></span>;
}

function weatherItem(wx: GameWeather): StatItem | null {
  if (wx.kind === 'none') return null;
  return {
    label: wx.kind === 'outdoor' ? 'Kickoff weather' : 'Roof',
    value: <WeatherValue wx={wx} />,
    sub: wx.kind === 'outdoor' ? [wx.condition, wx.wind?.replace(/^Wind /, '')].filter(Boolean).join(' · ') + (wx.flag ? ` · ${wx.flag}` : '') : wx.kind === 'retractable' ? 'Roof status not published' : 'No weather exposure',
    title: 'Captured by the publication for context; it does not enter the projection.',
    tone: wx.flag ? 'gold' : undefined,
  };
}

function PriceRow({ sides, now }: { sides: { abbr: string; m: Market | undefined }[]; now: number }) {
  const shown = sides.filter((s) => s.m?.yes_ask != null && s.m.yes_ask > 0 && s.m.yes_ask < 1);
  if (!shown.length) return null;
  const age = priceAge(shown[0].m!, now);
  return (
    <span className="ghs__px">
      {shown.map((s) => <span key={s.abbr} className="ghs__pxv"><b className="fx-num">{cents(s.m!.yes_ask!)}</b> <small>{s.abbr}</small></span>)}
      <span className={`ghs__age ghs__age--${age.state.toLowerCase()}`}>{age.text}</span>
    </span>
  );
}

/** The NFL hero strip: SIFT model, market lines, model win probability, game-winner prices, weather. */
export function NflHeroStats({ r, markets, now }: { r: EventResearchDoc; markets: Market[]; now: number }) {
  const n = heroNumbers(r);
  const spec = resolveHero(heroInputFromResearch(r, 'NFL'));
  const wx = gameWeather(r, spec.venue);
  if (!n) return null;
  const model = n.modelVersion ? `SIFT model ${n.modelVersion}` : 'SIFT model';
  const items: StatItem[] = [];
  if (n.away.modelScore != null && n.home.modelScore != null) {
    items.push({ label: 'SIFT projection', value: `${Math.round(n.away.modelScore)} – ${Math.round(n.home.modelScore)}`, sub: `${n.away.abbr}–${n.home.abbr} · research model`, title: `${model} projected score.${n.caveat ? ` ${n.caveat}` : ''}`, tone: 'cyan' });
  }
  if (n.marketSpread != null) items.push({ label: 'Market spread', value: spreadText(n.marketSpread, n), sub: n.modelSpread != null ? `Implied · SIFT ${spreadText(n.modelSpread, n)}` : 'Implied from prices', title: n.marketBasis ?? undefined, tone: 'green' });
  if (n.marketTotal != null) items.push({ label: 'Market total', value: String(halfRound(n.marketTotal)), sub: n.modelTotal != null ? `Implied · SIFT ${halfRound(n.modelTotal)}` : 'Implied from prices', title: n.marketBasis ?? undefined, tone: 'cyan' });
  if (n.away.modelWin != null && n.home.modelWin != null) {
    items.push({
      label: 'Model win probability',
      value: (
        <span className="ghs__win">
          <span className="ghs__wt">{n.away.abbr}</span>
          <Ring value={n.away.modelWin} tone="away" size={48} label={`${n.away.abbr} ${Math.round(n.away.modelWin * 100)}% (model)`} />
          <Ring value={n.home.modelWin} tone="home" size={48} label={`${n.home.abbr} ${Math.round(n.home.modelWin * 100)}% (model)`} />
          <span className="ghs__wt">{n.home.abbr}</span>
        </span>
      ),
      sub: `${model} · research only`,
      title: n.caveat ?? undefined,
    });
  }
  const homeP = r.participants.find((p) => p.home_away === 'HOME');
  const awayP = r.participants.find((p) => p.home_away === 'AWAY');
  if (homeP && awayP) {
    const px = <PriceRow now={now} sides={[{ abbr: n.away.abbr, m: winnerContract(markets, awayP.participant_id) }, { abbr: n.home.abbr, m: winnerContract(markets, homeP.participant_id) }]} />;
    if (winnerContract(markets, awayP.participant_id)?.yes_ask != null || winnerContract(markets, homeP.participant_id)?.yes_ask != null) {
      items.push({ label: 'To win · YES ask', value: px, title: 'Kalshi game-winner contracts: the YES ask for each team, with the quote age.' });
    }
  }
  const w = weatherItem(wx);
  if (w) items.push(w);
  return <StatStrip items={items} label="Game numbers, sourced" className="ghs" focusable />;
}

/**
 * The CFB hero strip. The Script Engine is ranked evidence with no likelihoods: the strip names the published claim (or
 * the PRIMARY script) and the engine's data confidence; prices are each team's own game-winner ask.
 */
export function CfbHeroStats({ r, engine, markets, now }: { r: EventResearchDoc; engine: Engine; markets: Market[]; now: number }) {
  const items: StatItem[] = [];
  const control = engine.claimsV2?.claims.control ?? null;
  const primary = engine.scripts[0] ?? null;
  if (control) {
    const team = engine.teams[control.side]?.name ?? control.side;
    items.push({ label: 'SIFT claim', value: team, sub: `${control.strength === 'STRONG' ? 'Strong' : 'Moderate'} control · research, not a chance`, tone: 'gold' });
  } else if (primary) {
    items.push({ label: `${ROLE_WORD[primary.role]} script`, value: <span className="ghs__txt">{scriptTitle(primary)}</span>, sub: 'Ranked evidence · no probability', tone: 'gold' });
  }
  for (const ha of ['AWAY', 'HOME'] as const) {
    const p = r.participants.find((x) => x.home_away === ha);
    if (!p) continue;
    const m = winnerContract(markets, p.participant_id);
    if (m?.yes_ask == null || m.yes_ask <= 0 || m.yes_ask >= 1) continue;
    const code = r.event.participants.find((x) => x.participant_id === p.participant_id)?.short_name ?? null;
    const age = priceAge(m, now);
    items.push({ label: `${cfbName(code, p.display_name)} to win`, value: cents(m.yes_ask), sub: <span className={`ghs__age ghs__age--${age.state.toLowerCase()}`}>YES ask · {age.text}</span>, tone: ha === 'HOME' ? 'cyan' : undefined });
  }
  items.push({ label: 'Data confidence', value: engine.confidence.level[0] + engine.confidence.level.slice(1).toLowerCase(), sub: 'Football evidence, not a lean', tone: engine.confidence.level === 'HIGH' ? 'green' : engine.confidence.level === 'LOW' ? 'red' : undefined });
  const spec = resolveHero(heroInputFromResearch(r, 'CFB'));
  const w = weatherItem(gameWeather(r, spec.venue));
  if (w) items.push(w);
  return <StatStrip items={items} label="Game numbers, sourced" className="ghs" focusable />;
}
