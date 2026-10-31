// Home is the games feed: a slim header, a day strip, the sport rail (only sports with games), college conference chips for NCAAF and NCAAB, and the
// day's games grouped by time (Live, each kickoff window, Final). What the viewer picked lives in the address (`sport`, `conf`, `date`), so Back and a
// shared link reopen the same slate, and the sport and conference are also remembered on this device. The order inside every section is
// model/priority.ts; the grouping is model/homeFeed.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConferenceGames } from '../data/conference';
import { useSlate } from '../data/useSlate';
import { conferencesIn, confToken, isCollege, matchesConference, resolveFilter } from '../model/conference';
import { buildSchedule, dayParts, dayStrip, DAY_KEY, gamesOnDay, jumpTargets, pickSport, sportChips, sportLabel, type Section, type SportChip } from '../model/homeFeed';
import { anyRanked, emptyMemory, type Memory } from '../model/priority';
import { dayKey, keyLabel, keyWord, shiftDayKey } from '../model/time';
import { homeSchema } from '../nav/schemas';
import { setPrefs, useAlerts, useFollows, usePrefs } from '../state/prefs';
import { useRouteState } from '../state/url';
import { BellSheet } from '../ui/BellSheet';
import { Brand } from '../ui/Brand';
import { ChipRail } from '../ui/ChipRail';
import { GameCard } from '../ui/GameCard';
import { Icon } from '../ui/Icon';
import { SearchButton } from '../ui/SearchButton';
import { useSheet } from '../ui/Sheet';
import { Welcome } from '../ui/Welcome';

/** The calendar sheet: the strip's fortnight is the quick path; the sheet reaches a month ahead (and the selected day when it is further out). */
function DateSheet({ day, today, onPick }: { day: string; today: string; onPick: (k: string) => void }) {
  const days = useMemo(() => {
    const l = Array.from({ length: 34 }, (_, i) => shiftDayKey(today, i - 3));
    return l.includes(day) ? l : [...l, day].sort();
  }, [day, today]);
  return (
    <ul className="v3-days" role="list">
      {days.map((k) => (
        <li key={k}><button type="button" aria-pressed={k === day} onClick={() => onPick(k)}>{k === today ? `Today · ${keyLabel(k)}` : keyLabel(k)}</button></li>
      ))}
    </ul>
  );
}

function SectionHead({ s, open, onToggle }: { s: Section; open: boolean; onToggle: () => void }) {
  const n = s.games.length;
  const label = `${s.title} · ${n}`;
  if (s.kind === 'final') {
    return (
      <h2 className="v3-sec__h">
        <button type="button" className="v3-sec__t" aria-expanded={open} aria-controls={`sec-${s.id}-list`} onClick={onToggle} aria-label={`${s.title}, ${n} ${n === 1 ? 'game' : 'games'}. ${open ? 'Collapse' : 'Expand'}`}>
          <span>{label}</span><Icon name={open ? 'chevU' : 'chevD'} size={18} />
        </button>
      </h2>
    );
  }
  return <h2 className="v3-sec__h"><span className={`v3-sec__t${s.kind === 'live' ? ' is-live' : ''}`}>{s.kind === 'live' && <i aria-hidden="true" />}<span>{label}</span></span></h2>;
}

export function Home() {
  const { games, loading, unavailable, unsupported, failed, saved, now, demo } = useSlate();
  const follows = useFollows();
  const sheet = useSheet();
  const alerts = useAlerts();
  const prefs = usePrefs();
  const [st, update] = useRouteState(homeSchema);
  const today = dayKey(now) ?? '';
  const day = st.date && DAY_KEY.test(st.date) ? st.date : today;

  // The day's games, the sports that have any, and the sport shown: the address, else this device's last choice, else the first sport in play.
  const dayGames = useMemo(() => gamesOnDay(games, day, today), [games, day, today]);
  const chips = useMemo(() => sportChips(dayGames), [dayGames]);
  const sport = pickSport(st.sport, prefs.homeSport, chips);
  const rail: SportChip[] = useMemo(() => (sport && !chips.some((c) => c.slug === sport) ? [...chips, { slug: sport, label: sportLabel(sport.toUpperCase()), live: 0, count: 0 }] : chips), [chips, sport]);
  const inSport = useMemo(() => dayGames.filter((g) => g.slug === sport), [dayGames, sport]);

  // College sports: conference identity loads when one is selected; the filter applies the moment it has.
  const college = !!sport && isCollege(sport);
  const { games: confGames, ready } = useConferenceGames(inSport, college);
  const asked = college ? st.conf ?? prefs.homeConf[sport!] ?? null : null;
  const conf = !college ? 'all' : ready ? resolveFilter(asked, confGames) : asked ?? 'all';
  const confs = useMemo(() => (college ? conferencesIn(confGames) : []), [college, confGames]);
  const hasTop25 = useMemo(() => college && confGames.some(anyRanked), [college, confGames]);
  const shown = useMemo(() => (college && ready ? confGames.filter((g) => matchesConference(g, conf)) : confGames), [college, ready, confGames, conf]);

  // The order the viewer has seen, kept between refreshes so a score change moves a card only when its tier changes (model/priority.ts).
  const memory = useRef<{ key: string; mem: Memory }>({ key: '', mem: emptyMemory() });
  const sections = useMemo(() => {
    const key = `${sport}|${day}|${conf}`;
    const r = buildSchedule(shown, follows, memory.current.key === key ? memory.current.mem : undefined);
    memory.current = { key, mem: r.memory };
    return r.sections;
  }, [shown, follows, sport, day, conf]);
  const jumps = useMemo(() => jumpTargets(sections), [sections]);

  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const jump = useCallback((id: string) => {
    setClosed((c) => (c[id] ? { ...c, [id]: false } : c));
    requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }, []);

  const pickSportChip = (slug: string) => { setPrefs({ homeSport: slug }); update({ sport: slug, conf: null }); };
  const pickConf = (token: string) => { if (sport) setPrefs({ homeConf: { ...prefs.homeConf, [sport]: token } }); update({ conf: token }); };
  const pickDay = (k: string) => update({ date: k === today ? null : k });
  const hasAlerts = Object.keys(alerts).length > 0;

  // First run on real data only: a skippable welcome, shown once. It never appears over sample data (QA) or blocks Home.
  useEffect(() => {
    if (demo || prefs.onboarded || loading || games.length === 0) return;
    setPrefs({ onboarded: true });
    sheet.open('Welcome to SIFT', <Welcome games={games} />, { tall: true });
  }, [demo, prefs.onboarded, loading, games.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => dayStrip(today, day), [today, day]);
  const nextDay = useMemo(() => {
    const later = games.filter((g) => g.slug === sport && (dayKey(g.startMs) ?? '') > day).map((g) => dayKey(g.startMs) ?? '').sort();
    return later[0] ?? null;
  }, [games, sport, day]);
  const waiting = loading && !games.length;
  const confPending = college && !ready;
  const anyOpen = sections.some((s) => s.kind !== 'final');

  return (
    <div className="v3-page v3-home">
      <header className="v3-top">
        <Brand />
        <span className="v3-top__sp" />
        <SearchButton />
        <button type="button" className="v3-datebtn" aria-label={`Choose a date. Showing ${keyWord(day, today)}`}
          onClick={() => sheet.open('Choose a day', <DateSheet day={day} today={today} onPick={(k) => { pickDay(k); sheet.close(); }} />)}>
          <Icon name="calendar" size={22} /><span>{keyWord(day, today)}</span>
        </button>
        <button type="button" className="v3-iconbtn" aria-label={`Alerts${hasAlerts ? ', some on' : ', none on'}`} onClick={() => sheet.open('Alerts', <BellSheet />)}>
          <Icon name="bell" size={24} />{hasAlerts && <i className="v3-bell__dot" aria-hidden="true" />}
        </button>
      </header>

      <ChipRail className="v3-daystrip" role="tablist" aria-label="Day">
        {days.map((k) => {
          const p = dayParts(k);
          return (
            <button key={k} type="button" role="tab" aria-selected={k === day} className="v3-day" aria-label={`${keyWord(k, today)}, ${keyLabel(k)}`} onClick={() => pickDay(k)}>
              <small>{k === today ? 'Today' : p.weekday}</small><b className="num">{p.date}</b>
            </button>
          );
        })}
      </ChipRail>

      {unavailable && <div className="v3-state v3-state--warn" role="alert" style={{ marginTop: 12 }}><Icon name="wifiOff" size={20} /><div><b>Published games are unavailable</b>{unsupported ? 'The publication is in a format this version of SIFT cannot read.' : <>A failed publication does not mean there are no games. Try again in a moment.<br /><button type="button" onClick={() => location.reload()}>Retry</button></>}</div></div>}
      {saved.length > 0 && <div className="v3-state v3-state--warn" role="status" style={{ marginTop: 12 }}><Icon name="info" size={20} /><div><b>Saved copy in use</b>{saved.map((x) => x.label).join(', ')} {saved.length === 1 ? 'is' : 'are'} showing the research saved with this app because the live publication could not be read. Prices appear only when a current Kalshi quote is available.</div></div>}
      {!unavailable && failed.length > 0 && <div className="v3-state" style={{ marginTop: 12 }}><Icon name="info" size={20} /><div><b>{failed.length} feed{failed.length === 1 ? '' : 's'} unavailable</b>{failed.join(', ')} could not be read; showing everything else.</div></div>}

      {rail.length > 0 && (
        <ChipRail className="v3-rail" role="tablist" aria-label="Sport">
          {rail.map((c) => (
            <button key={c.slug} type="button" role="tab" aria-selected={sport === c.slug} className="v3-rail__t" onClick={() => pickSportChip(c.slug)}>
              {c.label}{c.live > 0 && <i className="v3-rail__live" role="img" aria-label={`${c.live} live`} />}
            </button>
          ))}
        </ChipRail>
      )}

      {college && (confs.length > 0 || hasTop25) && (
        <ChipRail className="v3-chips v3-chips--conf" role="group" aria-label="Conference">
          {hasTop25 && <button type="button" className="v3-chip" aria-pressed={conf === 'top25'} onClick={() => pickConf('top25')}>Top 25</button>}
          <button type="button" className="v3-chip" aria-pressed={conf === 'all'} onClick={() => pickConf('all')}>All</button>
          {confs.map((c) => <button key={c} type="button" className="v3-chip" aria-pressed={conf === confToken(c)} onClick={() => pickConf(confToken(c))}>{c}</button>)}
        </ChipRail>
      )}

      {(waiting || confPending) && <div role="status" aria-label="Loading games" className="v3-gclist" style={{ marginTop: 12 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="v3-skel v3-gc-skel" />)}</div>}

      {!waiting && !confPending && jumps.length > 1 && (
        <nav className="v3-jump" aria-label="Jump to">
          {jumps.map((j) => <button key={j.id} type="button" onClick={() => jump(j.id)}>{j.label}<i>{j.count}</i></button>)}
        </nav>
      )}

      {!waiting && !confPending && !unavailable && sections.length === 0 && (
        <div className="v3-state" style={{ marginTop: 12 }}><Icon name="calendar" size={20} /><div>
          <b>Nothing here</b>
          {sport ? `No published ${sportLabel(sport.toUpperCase())} games ${day === today ? 'today' : `on ${keyLabel(day)}`}${conf === 'all' ? '' : ' for this filter'}.` : `No published games ${day === today ? 'today' : `on ${keyLabel(day)}`}.`}
          {conf !== 'all' && <><br /><button type="button" onClick={() => pickConf('all')}>Show all {sport ? sportLabel(sport.toUpperCase()) : ''} games</button></>}
          {nextDay && <><br /><button type="button" onClick={() => pickDay(nextDay)}>Next games: {keyWord(nextDay, today)}</button></>}
          {day !== today && <><br /><button type="button" onClick={() => pickDay(today)}>Back to today</button></>}
        </div></div>
      )}

      {!confPending && sections.map((s) => {
        const open = !closed[s.id];
        return (
          <section key={s.id} id={`sec-${s.id}`} className="v3-sec" aria-label={`${s.title}, ${s.games.length} ${s.games.length === 1 ? 'game' : 'games'}`}>
            <SectionHead s={s} open={open} onToggle={() => setClosed((c) => ({ ...c, [s.id]: !c[s.id] }))} />
            {open && <div className="v3-gclist" id={`sec-${s.id}-list`}>{s.games.map((g) => <GameCard key={g.key} g={g} />)}</div>}
            {s.kind === 'live' && open && <p className="v3-note v3-foot">Scores come from a licensed score feed only where one exists. Games in play without one show “Score unavailable”.</p>}
          </section>
        );
      })}
      {anyOpen && <p className="v3-note v3-linesnote">Lines: Kalshi prediction-market prices in ¢, not sportsbook odds.</p>}
    </div>
  );
}
