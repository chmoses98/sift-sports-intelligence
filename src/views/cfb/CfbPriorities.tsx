// CFB SLATE PRIORITIES — the CFB home's "where to look first" rail: the same visual pattern as the NFL rail
// (views/home/Priorities.tsx), CFB's own evidence (lib/cfbPriorities.ts). At most five items, each a link into its
// game (or the Value Watch filter). Value and football reads are different things and look different: only the
// Top Value Signal carries the gold "Value signal" mark and a price; a CONTROL read says plainly it is not a bet.
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { TeamMark } from '../../components/ui';
import { ago } from '../../lib/format';
import { cfbMatchupNames } from '../../lib/cfbTeams';
import { cfbPriorities, type CfbPick } from '../../lib/cfbPriorities';
import { pastGamesText, priceText, STRENGTH_LABEL, type SignalsDoc, type SlateGame } from '../../lib/cfbSignals';
import { routes } from '../../lib/routes';
import { sides } from '../home/cards';
import { Info } from '../game/panels';
import { CfbGlyph } from './kit';

const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function matchNames(x: SlateGame) {
  const { away, home } = sides(x.item);
  const n = cfbMatchupNames({ code: away?.short_name, name: away?.display_name }, { code: home?.short_name, name: home?.display_name });
  return { awayP: away, homeP: home, away: n.away, home: n.home };
}

/** Both schools and kickoff. `plain` drops the logos when the item already leads with the team's mark. */
function Matchup({ x, plain }: { x: SlateGame; plain?: boolean }) {
  const m = matchNames(x);
  return (
    <span className="prio__match">
      {!plain && <span className="prio__logos" aria-hidden="true"><TeamMark sport="CFB" abbr={m.awayP?.short_name} size="sm" /><TeamMark sport="CFB" abbr={m.homeP?.short_name} size="sm" /></span>}
      <span className="prio__teams">{m.away} <span className="prio__at">at</span> {m.home}</span>
      <span className="prio__when">{when(x.item.start_time_utc)}</span>
    </span>
  );
}

/** What kind of evidence an item is: the one distinction the rail must never blur. */
function Kind({ k, children }: { k: 'value' | 'read' | 'explore' | 'watch'; children: ReactNode }) {
  return <span className={`prio__kind prio__kind--${k}`}>{children}</span>;
}

function Item({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link to={to} className="prio__a" aria-label={label}>
      {children}
      <Icon name="chevronRight" size={16} className="prio__go" />
    </Link>
  );
}

/** The CONTROL side's team code (for its logo). */
const controlCode = (x: SlateGame) => {
  const side = x.g?.claims?.control?.side;
  const { away, home } = sides(x.item);
  return side === 'home' ? home?.short_name ?? null : side === 'away' ? away?.short_name ?? null : null;
};

const matchLabel = (x: SlateGame) => {
  const m = matchNames(x);
  return `${m.away} at ${m.home}`;
};

export function CfbSlatePriorities({ games, doc, loading, slug, now }: { games: SlateGame[]; doc: SignalsDoc | null; loading: boolean; slug: string; now: number }) {
  const game = (x: SlateGame) => routes.game(slug, x.item.event_id);
  const head = (
    <header className="prio__head">
      <span className="eyebrow">Slate priorities</span>
      <h2 className="prio__t" id="cfprio-h">Where to look first</h2>
      <Info label="How SIFT picks these" align="end">
        Each item is picked by a fixed rule from this slate’s CFB research signals — nothing is hand-picked, and an empty section stays empty.
        <br /><br /><b>Top value signal</b> is only what SIFT’s value framework calls value: a Value Watch game (Moderate CONTROL while the framework marks it Value Watch) with a fresh, executable price. Highest data quality first, then the earliest kickoff.
        <br /><br /><b>Strongest game read</b> is the Strong CONTROL read whose profile has the widest historical winning margin. It is a football read: the market already prices Strong CONTROL about right, so it is not a bet.
        <br /><br /><b>Market disagreement</b> is a Strong CONTROL side the market prices below {doc?.signals.market_disagreement.rule.below_cents ?? 85}¢ on a fresh quote, furthest below first. Exploratory: the market may be right.
        <br /><br /><b>Game to watch</b> is the close-game profile carrying the most other research claims (pace, scoring, defense, disruption). Interesting, not a bet.
      </Info>
    </header>
  );

  if (loading && !doc) {
    return <section className="prio prio--cfb" aria-labelledby="cfprio-h">{head}<p className="prio__state">Reading this slate’s research…</p></section>;
  }
  if (!doc) {
    return (
      <section className="prio prio--cfb" aria-labelledby="cfprio-h">
        {head}
        <p className="prio__state"><b>Research signals unavailable</b> SIFT cannot read this slate’s research signals right now, so nothing is prioritized. The games below are complete.</p>
      </section>
    );
  }

  const p = cfbPriorities(games, doc, now);
  const s = doc.signals;
  const ageText = (x: SlateGame) => (x.price.source === 'live' ? 'live price' : x.price.observedAt ? `price ${ago(x.price.observedAt, now)}` : '');
  const pick = (c: CfbPick) => c.x;

  let body: ReactNode;
  if (!p.upcoming) {
    body = <p className="prio__state"><b>No upcoming games</b> Every game on this slate has kicked off or finished. Priorities return with the next slate.</p>;
  } else if (!p.withRead) {
    body = <p className="prio__state"><b>Research still building</b> No game still to play on this slate has a published SIFT read yet, so nothing is prioritized.</p>;
  } else {
    body = (
      <ol className="prio__l">
        <li className="prio__i prio__i--value" data-priority="value">
          <span className="prio__k"><CfbGlyph name="star" tone="star" size={15} />Top value signal</span>
          {p.value.kind === 'pick' ? (
            <Item to={game(pick(p.value.pick))} label={`${matchLabel(pick(p.value.pick))}: ${s.moderate_control.label}, ${priceText(p.value.pick.team ?? '', pick(p.value.pick).price)}. Open game.`}>
              <span className="prio__mk"><TeamMark sport="CFB" abbr={controlCode(pick(p.value.pick))} size="sm" /><b>{p.value.pick.team} win</b><span className="prio__px num">{pick(p.value.pick).price.cents}¢</span></span>
              <Matchup x={pick(p.value.pick)} plain />
              <span className="prio__why"><Kind k="value">Value signal</Kind> {s.moderate_control.label}: {lc(s.moderate_control.short)}; {lc(s.moderate_control.status_line)}.</span>
              <span className="prio__meta"><span>{p.value.of === 1 ? 'The only Value Watch game priced now' : `1 of ${p.value.of} Value Watch games priced now`}</span><span>{ageText(pick(p.value.pick))}</span></span>
            </Item>
          ) : (
            <p className={`prio__none prio__none--${p.value.kind}`}><b>{p.value.title}</b> {p.value.text}</p>
          )}
          {p.value.kind === 'pick' && p.value.of > 1 && (
            <Link to={`${routes.sport(slug)}?f=value-watch`} className="prio__more">All Value Watch games <Icon name="arrowRight" size={13} /></Link>
          )}
        </li>

        {p.read && (
          <li className="prio__i prio__i--read" data-priority="read">
            <span className="prio__k"><CfbGlyph name="control" tone="control" size={15} />Strongest game read</span>
            <Item to={game(p.read.x)} label={`${matchLabel(p.read.x)}: ${p.read.team} controls the matchup. A football read, not a bet. Open game.`}>
              <span className="prio__mk"><TeamMark sport="CFB" abbr={controlCode(p.read.x)} size="sm" /><b>{p.read.team} Controls the Matchup</b></span>
              <Matchup x={p.read.x} plain />
              <span className="prio__why">
                <Kind k="read">Football read · not a bet</Kind> The clearest control read on the slate
                {p.read.x.g?.historical ? <>: teams with this profile won {pastGamesText(p.read.x.g.historical)}</> : ''}. {s.strong_control.market_summary}.
              </span>
            </Item>
          </li>
        )}

        {p.disagreement.kind === 'pick' && (
          <li className="prio__i prio__i--dis" data-priority="disagreement">
            <span className="prio__k"><CfbGlyph name="alert" tone="alert" size={15} />Biggest market disagreement</span>
            <Item to={game(p.disagreement.pick.x)} label={`${matchLabel(p.disagreement.pick.x)}: SIFT reads ${p.disagreement.pick.team} in control; the market prices them at ${p.disagreement.pick.x.price.cents} cents. Exploratory, not a bet. Open game.`}>
              <span className="prio__mk"><TeamMark sport="CFB" abbr={controlCode(p.disagreement.pick.x)} size="sm" /><b>{p.disagreement.pick.team} win</b><span className="prio__px prio__px--alert num">{p.disagreement.pick.x.price.cents}¢</span></span>
              <Matchup x={p.disagreement.pick.x} plain />
              <span className="prio__why">
                <Kind k="explore">Exploratory · not a bet</Kind> SIFT reads {p.disagreement.pick.team} in strong control; the market prices them {p.disagreement.gap}¢ below the {s.market_disagreement.rule.below_cents}¢ line. The market may be right.
              </span>
              <span className="prio__meta"><span>{s.market_disagreement.label}</span><span>{ageText(p.disagreement.pick.x)}</span></span>
            </Item>
          </li>
        )}
        {p.disagreement.kind === 'stale' && (
          <li className="prio__i prio__i--dis" data-priority="disagreement">
            <span className="prio__k"><CfbGlyph name="alert" tone="alert" size={15} />Biggest market disagreement</span>
            <p className="prio__none prio__none--stale"><b>Waiting for updated prices</b> The latest market quotes are stale, so no disagreement is shown.</p>
          </li>
        )}

        {p.watch && (
          <li className="prio__i prio__i--watch" data-priority="watch">
            <span className="prio__k"><CfbGlyph name="close" tone="close" size={15} />Game to watch</span>
            <Item to={game(p.watch.x)} label={`${matchLabel(p.watch.x)}: ${p.watch.reason} Open game.`}>
              <Matchup x={p.watch.x} />
              <span className="prio__why"><Kind k="watch">Interesting · not a bet</Kind> {p.watch.reason}</span>
            </Item>
          </li>
        )}

        {p.look && (
          <li className="prio__i prio__i--look" data-priority="look">
            <span className="prio__k"><Icon name="eye" size={15} />Worth a look</span>
            <Item to={game(p.look.x)} label={`${matchLabel(p.look.x)}: ${p.look.tag}, ${p.look.team}. Open game.`}>
              <Matchup x={p.look.x} />
              <span className="prio__why">
                {p.look.x.valueWatch
                  ? <><Kind k="value">Value signal</Kind> {p.look.tag}: {priceText(p.look.team ?? '', p.look.x.price)}.</>
                  : <><Kind k="read">Football read · not a bet</Kind> {p.look.tag}: {p.look.team} {STRENGTH_LABEL.STRONG.toLowerCase()}.</>}
              </span>
            </Item>
          </li>
        )}
      </ol>
    );
  }

  return (
    <section className="prio prio--cfb" aria-labelledby="cfprio-h">
      {head}
      {body}
      <p className="prio__foot">Research evidence, not bets — only a value signal is a market opportunity. Tap any item for the full read.</p>
    </section>
  );
}
