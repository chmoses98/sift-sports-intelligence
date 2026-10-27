// The player's header (locked design P1): the hero (photo, team identity, availability, follow and save), the compact bar that takes its
// place once the hero is off screen (and always on the Matchup tab, P4), and the game strip with both teams' logos and the next game.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '../../../routing';
import { HeroBg } from '../../ui/HeroBg';
import { Icon } from '../../ui/Icon';
import { FollowStar } from '../../ui/Controls';
import { TeamLogo } from '../../ui/TeamLogo';
import { GameLink, TeamLink } from '../../nav/Targets';
import { gameWhen } from '../../model/playerResearch';
import type { PlayerView } from './view';

const AT = (v: PlayerView) => (v.vm?.nextHome === false ? 'at' : 'vs');

/** Back to where the viewer came from; a screen opened directly falls back to Explore. */
export function useBack() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => { if (loc.key !== 'default') nav(-1); else nav('/v3/explore', { replace: true }); };
}

export function SaveButton({ v, saved, onToggle }: { v: PlayerView; saved: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`v3-iconbtn v3p-save${saved ? ' is-on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove saved research' : 'Save this research'} disabled={!v.vm || !v.stat} onClick={onToggle}>
      <Icon name="bookmark" size={22} fill={saved} />
    </button>
  );
}

const lastName = (n: string) => n.split(' ').slice(-1)[0];

export function Hero({ v, saved, onSave, heroRef }: { v: PlayerView; saved: boolean; onSave: () => void; heroRef: React.RefObject<HTMLElement | null> }) {
  const vm = v.vm;
  const back = useBack();
  const first = vm ? vm.name.split(' ').slice(0, -1).join(' ') : '';
  const photo = vm?.photo ?? null;
  const av = v.modelReady.availability;
  return (
    <header ref={heroRef} className={`v3p-hero${photo ? ' has-photo' : ''}`} data-hero>
      {vm?.team && <HeroBg g={{ away: vm.team, home: vm.team, photo: null }} cover />}
      {photo && <img className="v3p-hero__ph" src={photo.src} alt="" style={{ objectPosition: photo.focus }} />}
      <i className="v3p-hero__shade" aria-hidden="true" />
      <div className="v3p-hero__bar">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
        <span className="v3p-sp" />
        {vm && <FollowStar kind="players" id={`${v.slug}:${v.pid}`} label={vm.name} />}
        <SaveButton v={v} saved={saved} onToggle={onSave} />
      </div>
      {vm && (
        <div className="v3p-who">
          <div className="v3p-who__l">
            {vm.team && <TeamLink team={{ slug: vm.team.slug, id: vm.team.id }} label={`${vm.team.name}, team page`} className="v3p-who__logo"><TeamLogo team={vm.team} size={46} /></TeamLink>}
            <h1><span className="f">{first || ' '}</span><span className="l">{lastName(vm.name)}</span></h1>
          </div>
          <p className="v3p-who__m">
            <span>{[vm.position, vm.team?.abbr].filter(Boolean).join(' · ')}{vm.provenance === 'demo' ? ' · sample' : ''}</span>
            {av && <span className={`v3p-chip ${av.status === 'LIKELY_ACTIVE' || av.status === 'CONFIRMED_ACTIVE' ? 'is-ok' : av.status === 'UNCERTAIN' ? 'is-warn' : 'is-bad'}`}><i aria-hidden="true" />{av.words}</span>}
          </p>
        </div>
      )}
      {photo && <small className="v3p-hero__credit">Photo: {photo.credit}</small>}
    </header>
  );
}

/** The compact header: back, the player's face, name and what is open, save. Overlays the top once the hero has scrolled away; on Matchup it is in flow. */
export function MiniBar({ v, saved, onSave, shown, inflow, short }: { v: PlayerView; saved: boolean; onSave: () => void; shown: boolean; inflow: boolean; short?: boolean }) {
  const vm = v.vm;
  const back = useBack();
  if (!vm) return null;
  const when = vm.next && vm.nextStartMs != null ? `${AT(v)} ${vm.opp?.abbr ?? ''} · ${gameWhen(vm.nextStartMs, v.now)}` : null;
  const sub = v.state.tab === 'matchup' ? [vm.position, vm.team?.abbr].filter(Boolean).join(' · ') + (when ? ` ${when}` : '') : [v.statDef?.label, when].filter(Boolean).join(' · ');
  return (
    <div className={`v3p-mini${inflow ? ' is-flow' : ''}${shown || inflow ? ' is-on' : ''}`} aria-hidden={!(shown || inflow)} inert={!(shown || inflow)}>
      <div className="v3p-mini__in">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back} tabIndex={shown || inflow ? 0 : -1}><Icon name="back" size={24} /></button>
        {vm.photo ? <img className="v3p-mini__av" src={vm.photo.src} alt="" style={{ objectPosition: vm.photo.focus }} /> : vm.team ? <span className="v3p-mini__av is-logo"><TeamLogo team={vm.team} size={22} /></span> : null}
        <div className="v3p-mini__t"><b>{vm.name}</b><span>{sub}</span></div>
        {short && vm.team && <TeamLink team={{ slug: vm.team.slug, id: vm.team.id }} label={`${vm.team.name}, team page`} className="v3p-who__logo"><TeamLogo team={vm.team} size={28} /></TeamLink>}
        {short && <FollowStar kind="players" id={`${v.slug}:${v.pid}`} label={vm.name} />}
        <SaveButton v={v} saved={saved} onToggle={onSave} />
      </div>
    </div>
  );
}

/**
 * A short phone (an iPhone SE is 667 points tall): the hero gives way to the compact bar so the chart, the line and the price all fit above
 * the tab bar (the design's first-screen rule: chart first). Taller phones keep the locked hero.
 */
export function useShortScreen(): boolean {
  const q = '(max-height: 700px)';
  const [short, setShort] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia(q);
    const on = () => setShort(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return short;
}

/** True while the element is off screen above the viewport (the compact bar then shows). */
export function useGone(ref: React.RefObject<HTMLElement | null>, on: boolean): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || typeof IntersectionObserver === 'undefined') { setGone(false); return; }
    const io = new IntersectionObserver(([e]) => setGone(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, on]);
  return gone;
}

export function GameStrip({ v }: { v: PlayerView }) {
  const vm = v.vm;
  if (!vm) return null;
  if (!vm.next || !vm.opp || !vm.team) return <p className="v3p-nogame">No upcoming game for this player is on the published slate.</p>;
  const spread = vm.gameLines.find((l) => l.kind === 'spread'), total = vm.gameLines.find((l) => l.kind === 'total');
  const second = [spread?.label, total?.label].filter(Boolean).join(' · ');
  return (
    <div className="v3p-strip-g v3p-card">
      <TeamLink team={{ slug: vm.team.slug, id: vm.team.id }} label={`${vm.team.name}, team page`}><TeamLogo team={vm.team} size={34} /></TeamLink>
      <GameLink game={{ slug: vm.next.slug, eventId: vm.next.eventId }} label={`${vm.team.nick} ${vm.nextHome ? 'versus' : 'at'} ${vm.opp.nick}. Open game`} className="v3p-strip-g__c">
        <b>{AT(v)} {vm.opp.abbr}{vm.nextStartMs != null && gameWhen(vm.nextStartMs, v.now) ? ` · ${gameWhen(vm.nextStartMs, v.now)}` : ''}</b>
        {second && <span>{second}</span>}
      </GameLink>
      <TeamLink team={{ slug: vm.opp.slug, id: vm.opp.id }} label={`${vm.opp.name}, team page`}><TeamLogo team={vm.opp} size={34} /></TeamLink>
    </div>
  );
}

export function useHeroRef() { return useRef<HTMLElement | null>(null); }
