import { Link } from '../../routing';
import { useGameStart } from '../data/research/gameHooks';
import { useGameExtras } from '../data/useGameExtras';
import { closenessOf, lateness, progressOf } from '../model/priority';
import type { V3Game } from '../model/types';
import { AlertBell, FollowStar } from './Controls';
import { Icon } from './Icon';
import { TeamLogo } from './TeamLogo';
import { DelayedMark, LinesBox, PriceText, gameHref, leagueLabel, scoreSourceWord, statusWord, teamHref, useListGate, useOpenContract, useSeen } from './gamebits';

/** A live game that is within one score and into its last stretch: the two facts the priority order weighs together, said in two words. */
const closeAndLate = (g: V3Game): boolean => {
  if (g.phase !== 'live') return false;
  const c = closenessOf(g.sport, g.score);
  return c != null && c >= 0.6 && lateness(progressOf(g.sport, g.score?.clock)) >= 0.5;
};

function Side({ g, side }: { g: V3Game; side: 'away' | 'home' }) {
  const t = g[side];
  const sc = g.score?.[side];
  const other = g.score?.[side === 'away' ? 'home' : 'away'];
  const lead = sc != null && other != null && sc > other && g.phase === 'final';
  return (
    <div className="v3-gc__side">
      <Link to={teamHref(t)} className="v3-gc__team" aria-label={`${t.name}, team page`}>
        <TeamLogo team={t} size={28} />
        <span className="v3-gc__id">
          <span className="v3-gc__nm">{t.rank ? <small>#{t.rank}</small> : null}{t.nick}</span>
          {t.record && <span className="v3-gc__rec num">{t.record}</span>}
        </span>
        {g.phase === 'live' && g.situation?.possession === side && <i className="v3-gc__poss" role="img" aria-label="Has possession" />}
      </Link>
      {sc != null && <span className={`v3-gc__sc num${lead ? ' is-lead' : ''}`}>{sc}</span>}
    </div>
  );
}

/**
 * One game as a card. Tap regions are independent: the card body opens the game, each team opens its page, the line box
 * opens the exact market, the star follows the game and the bell sets alerts. A child tap never reaches the card.
 */
export function GameCard({ g: base }: { g: V3Game }) {
  const [ref, seen] = useSeen<HTMLElement>();
  // The schedule authority's start picks the quote tier; every price on the card goes through the list-context gate.
  // Read only for a card that has been near the screen: a league's schedule is one document per league (up to 450 KB), so a list does not read the leagues of cards nobody scrolled to.
  const startMs = useGameStart(seen ? base : null);
  // The card's lines are its rows: one rows scope per card that has been near the screen (nothing for a card nobody scrolled to), tiered by that start.
  const x = useGameExtras(base, 'lines', seen, startMs);
  const g = x?.game ?? base;
  const open = useOpenContract();
  const gate = useListGate(g, startMs);
  const live = g.phase === 'live';
  const scored = g.score != null;
  const src = scoreSourceWord(g);
  const hasSituation = live && !!g.situation?.text;
  const label = `${g.away.name} at ${g.home.name}, ${scored ? `${g.score!.away} to ${g.score!.home}, ` : ''}${statusWord(g)}. Open game`;
  const spread = g.lines.find((l) => l.kind === 'spread');
  const total = g.lines.find((l) => l.kind === 'total');
  return (
    <article ref={ref} className={`v3-gc${live ? ' is-live' : ''}${hasSituation ? ' has-sit' : ''}`}>
      <Link to={gameHref(g)} className="v3-gc__hit" aria-label={label} />
      <header className="v3-gc__h">
        <span className="v3-gc__lg" data-sport={g.slug}>{leagueLabel(g)}</span>
        {g.away.conference && g.away.conference === g.home.conference && <span className="v3-gc__cf">{g.away.conference}</span>}
        {live ? <span className="v3-gc__live"><Icon name="clock" size={14} />{g.score?.clock ?? 'In play'}<DelayedMark g={g} /></span> : <span className="v3-gc__time">{statusWord(g)}</span>}
        {closeAndLate(g) && <span className="v3-gc__hot">Close · late</span>}
        <span className="v3-gc__net">{g.network ?? ''}</span>
      </header>
      <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} className="v3-gc__star" />
      <div className="v3-gc__b">
        <div className="v3-gc__sides">
          <Side g={g} side="away" />
          <Side g={g} side="home" />
        </div>
        {hasSituation ? (
          <div className="v3-gc__sit"><span>{g.situation!.text}</span></div>
        ) : (
          <LinesBox g={g} startMs={startMs} gate={gate} loading={g.provenance === 'publication' && g.phase !== 'final' && x?.detailLoading} />
        )}
        <div className="v3-gc__act">
          <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
        </div>
      </div>
      {(hasSituation && (spread || total)) && (
        <button type="button" className="v3-gc__foot" onClick={() => open({ g, startMs, detailHref: gameHref(g) }, (spread ?? total)!)} aria-label="Open market detail">
          {spread && <span>{spread.label} <b><PriceText p={gate(spread.price)} /></b></span>}
          {total && <span>{total.label} <b><PriceText p={gate(total.price)} /></b></span>}
          <small>{(spread ?? total)!.price.source}</small>
        </button>
      )}
      {src && <p className="v3-gc__src">{src}</p>}
    </article>
  );
}
