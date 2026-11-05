// The one favorites picker (a sheet): search, a sport/league filter, one switch for all college sports, a whole-league row and a conference chip per
// league, and individual teams. Every row is a single toggle (aria-pressed) that writes the follows store at once, so the state shows immediately and
// a tap adds or removes. "Done" closes the sheet. Reachable from My SIFT and from Home's empty Following state (`useFavoritesPicker`).
// Following here is the star's follow, never an alert: nothing in this sheet subscribes to anything.
import { useCallback, useMemo, useState } from 'react';
import { useDirectory } from '../data/teamDirectory';
import { useSlate } from '../data/useSlate';
import { leagueLabel, pickerView, type PickLeague, type PickTeam } from '../model/favorites';
import { followCount } from '../model/following';
import { conferenceKey, COLLEGE_ALL, coveredBy, hasGroup, leagueKey } from '../model/groups';
import { toggleFollow, toggleGroup, useFollows } from '../state/prefs';
import { ChipRail } from './ChipRail';
import { Icon } from './Icon';
import { useSheet } from './Sheet';
import { TeamLogo } from './TeamLogo';
import './favorites.css';

const TEAM_PAGE = 60;

/** The state a row prints on its right: the pressed state is the aria-pressed on the button, so this is decoration. */
function RowState({ on, covered }: { on: boolean; covered: boolean }) {
  return <span className="v3-fav__state" aria-hidden="true">{on ? <><Icon name="check" size={16} />{covered ? 'Included' : 'Following'}</> : <><Icon name="plus" size={16} />Follow</>}</span>;
}

/** A switch for a whole group (all college sports, or a league). A group already covered by a wider one reads "Included" and is not separately switchable. */
function GroupRow({ gkey, title, sub }: { gkey: string; title: string; sub: string }) {
  const f = useFollows();
  const own = hasGroup(f.groups, gkey);
  const via = coveredBy(f.groups, gkey);
  const on = own || !!via;
  return (
    <button type="button" className="v3-fav__row" aria-pressed={on} aria-disabled={via && !own ? true : undefined} aria-label={`${title}. ${sub}`}
      onClick={() => { if (!(via && !own)) toggleGroup(gkey); }}>
      <span className="v3-fav__ic" aria-hidden="true"><Icon name="star" size={22} fill={on} /></span>
      <span className="v3-fav__t"><b>{title}</b><small>{via && !own ? `Included in ${via === COLLEGE_ALL ? 'All college sports' : leagueLabel(via.slice('league:'.length))}` : sub}</small></span>
      <RowState on={on} covered={!!via && !own} />
    </button>
  );
}

function TeamRow({ t }: { t: PickTeam }) {
  const f = useFollows();
  const on = f.teams.includes(t.key);
  return (
    <li>
      <button type="button" className="v3-fav__row" aria-pressed={on} aria-label={`${t.name}, ${leagueLabel(t.slug)}${t.conference ? `, ${t.conference}` : ''}`} onClick={() => toggleFollow('teams', t.key)}>
        <span className="v3-fav__ic" aria-hidden="true"><TeamLogo team={{ logo: t.logo, abbr: t.abbr, colors: t.colors, name: t.name }} size={30} /></span>
        <span className="v3-fav__t"><b>{t.name}</b><small>{leagueLabel(t.slug)}{t.conference ? ` · ${t.conference}` : ''}</small></span>
        <RowState on={on} covered={false} />
      </button>
    </li>
  );
}

function ConferenceChips({ league, confs }: { league: PickLeague; confs: PickLeague['conferences'] }) {
  const f = useFollows();
  if (!confs.length) return null;
  return (
    <ChipRail className="v3-chips v3-fav__confs" role="group" aria-label={`${league.label} conferences to follow`}>
      {confs.map((c) => {
        const key = conferenceKey(league.slug, c.label);
        const own = hasGroup(f.groups, key);
        const via = coveredBy(f.groups, key);
        const on = own || !!via;
        return (
          <button key={c.token} type="button" className="v3-chip" aria-pressed={on} aria-disabled={via && !own ? true : undefined}
            aria-label={`${league.label} ${c.label} conference${c.count ? `, ${c.count} teams` : ''}${via && !own ? `, included in ${via === COLLEGE_ALL ? 'all college sports' : leagueLabel(via.slice('league:'.length))}` : ''}`}
            onClick={() => { if (!(via && !own)) toggleGroup(key); }}>
            {on && <Icon name="check" size={14} />}{c.label}
          </button>
        );
      })}
    </ChipRail>
  );
}

export function FavoritesPicker() {
  const sheet = useSheet();
  const f = useFollows();
  const { games } = useSlate();
  const { leagues, collegeReady } = useDirectory(games);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(TEAM_PAGE);
  const chips = useMemo(() => leagues.map((l) => ({ slug: l.slug, label: l.label })), [leagues]);
  const view = useMemo(() => pickerView(leagues, filter, q, shown), [leagues, filter, q, shown]);
  const several = view.leagues.length > 1;
  const pickFilter = (slug: string) => { setFilter(slug); setShown(TEAM_PAGE); };
  const waiting = !collegeReady && (filter === 'cfb' || filter === 'cbb' || (!!q.trim() && filter !== 'nfl'));
  const n = followCount(f);

  return (
    <div className="v3-fav">
      <label className="v3-fav__search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(TEAM_PAGE); }} placeholder="Search teams, leagues, conferences" aria-label="Search teams, leagues and conferences" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={16} /></button>}
      </label>

      <ChipRail className="v3-chips" role="group" aria-label="Sport or league">
        <button type="button" className="v3-chip" aria-pressed={filter === 'all'} onClick={() => pickFilter('all')}>All</button>
        {chips.map((c) => <button key={c.slug} type="button" className="v3-chip" aria-pressed={filter === c.slug} onClick={() => pickFilter(c.slug)}>{c.label}</button>)}
      </ChipRail>

      <p className="v3-fav__sum" role="status">{n === 0 ? 'Nothing followed yet.' : `Following ${n} ${n === 1 ? 'item' : 'items'}.`} Tap to add or remove.</p>

      {(view.collegeRow || view.leagues.some((l) => l.leagueRow)) && (
        <section aria-label="Follow a whole group" className="v3-fav__list">
          {view.collegeRow && <GroupRow gkey={COLLEGE_ALL} title="All college sports" sub="Every NCAAF and NCAAB game" />}
          {view.leagues.filter((l) => l.leagueRow).map((l) => <GroupRow key={l.league.slug} gkey={leagueKey(l.league.slug)} title={`All ${l.league.label}`} sub={`Every ${l.league.label} game`} />)}
        </section>
      )}

      {view.leagues.map((l) => (
        <section key={l.league.slug} aria-label={`${l.league.label} teams and conferences`} className="v3-fav__list">
          {l.conferences.length > 0 && <h3 className="v3-fav__h">{several ? `${l.league.label} conferences` : 'Conferences'}</h3>}
          <ConferenceChips league={l.league} confs={l.conferences} />
          {l.teams.length > 0 && <h3 className="v3-fav__h">{several ? `${l.league.label} teams` : 'Teams'}</h3>}
          {l.teams.length > 0 && <ul className="v3-fav__list" aria-label={`${l.league.label} teams`}>{l.teams.map((t) => <TeamRow key={t.key} t={t} />)}</ul>}
          {l.moreTeams > 0 && <button type="button" className="v3-fav__more" onClick={() => setShown((s) => s + TEAM_PAGE)}>Show {Math.min(l.moreTeams, TEAM_PAGE)} more {l.league.label} teams</button>}
        </section>
      ))}

      {view.chooseHint && <p className="v3-note">Pick a league above to follow single teams, or search for a team.</p>}
      {waiting && <p className="v3-note" role="status">Loading college teams</p>}
      {view.empty && !waiting && <div className="v3-state"><Icon name="search" size={20} /><div><b>Nothing matches</b>No team, league or conference matches “{q.trim()}”.<br /><button type="button" onClick={() => setQ('')}>Clear search</button></div></div>}

      <div className="v3-fav__done"><button type="button" className="v3-fav__donebtn" onClick={sheet.close}>Done</button></div>
    </div>
  );
}

/** Opens the picker over the current screen. */
export function useFavoritesPicker(): () => void {
  const sheet = useSheet();
  return useCallback(() => sheet.open('Choose favorites', <FavoritesPicker />, { tall: true }), [sheet]);
}
