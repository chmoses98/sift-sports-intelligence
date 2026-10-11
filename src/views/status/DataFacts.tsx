// Data & provenance: the venue facts table (roof construction, surface, home teams) with the publication issues it
// corrects, and where each sport's injury list comes from with the age rule Sift applies to it.
import { useMemo, useState } from 'react';
import { Stratum } from '../../components/ui';
import { canonicalTeam } from '../../lib/hero/registry';
import { ROOF_WORD, SURFACE_WORD, VENUE_FACTS, type VenueFact } from '../../lib/venueFacts';
import { INJURY_FRESH_MS, INJURY_STALE_MS } from '../../lib/injurySource';
import '../../styles/lane-f-data.css';

type Group = 'NFL' | 'CFB' | 'MLB' | 'International';
const GROUPS: Group[] = ['NFL', 'CFB', 'MLB', 'International'];

function groupOf(v: VenueFact): Group {
  if (v.country !== 'US' && !v.tenants.length) return 'International';
  if (v.tenants.some((t) => t.sport === 'NFL')) return 'NFL';
  if (v.tenants.some((t) => t.sport === 'MLB')) return 'MLB';
  return 'CFB';
}

export function VenueFactsSection() {
  const [g, setG] = useState<Group>('NFL');
  const rows = useMemo(() => VENUE_FACTS.filter((v) => groupOf(v) === g).sort((a, b) => a.name.localeCompare(b.name)), [g]);
  return (
    <Stratum id="venues" title="Venues, roofs and kickoff weather" sub="Weather is shown only where a game is exposed to it: domes say indoors, retractable roofs show the outside forecast as context until a publication says the roof is open, and open-air forecasts are labelled as context (no production projection uses weather).">
      <div className="seg" role="radiogroup" aria-label="Venue group">
        {GROUPS.map((x) => <button key={x} type="button" role="radio" aria-checked={g === x} className={`seg__b${g === x ? ' is-on' : ''}`} onClick={() => setG(x)}>{x === 'CFB' ? 'College indoor' : x}</button>)}
      </div>
      <div className="venuefacts__wrap">
        <table className="dtable venuefacts">
          <thead><tr><th scope="col">Venue</th><th scope="col">Roof</th><th scope="col">Surface</th><th scope="col">Home teams</th><th scope="col">Note</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <th scope="row">{v.name}<span className="muted small"> · {v.city}</span></th>
                <td>{ROOF_WORD[v.roof]}</td>
                <td>{v.surface ? SURFACE_WORD[v.surface] : <span className="muted">Not confirmed</span>}</td>
                <td className="small">{v.tenants.length ? [...new Set(v.tenants.map((t) => `${t.sport} ${canonicalTeam(t.sport, t.team) ?? t.team}`))].join(', ') : <span className="muted">Neutral site</span>}</td>
                <td className="small muted">{v.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Roof construction: public stadium records, checked 2026-10-11 against nflverse schedules (2022–2026) and Sift's venue registry. NFL surfaces:
        nflverse 2026 schedule rows. Whether a retractable roof is open for a game is never assumed: only a publication can say so. Most college stadiums
        are open-air and are not listed here.
      </p>
      <h3 className="dfacts__h">Publication issues Sift corrects for (2026-10-11)</h3>
      <ul className="lims">
        <li><b>Blank roof for retractable roofs.</b> The NFL publication leaves the roof field empty for retractable-roof stadiums (State Farm Stadium, Mercedes-Benz Stadium, Lucas Oil Stadium, AT&amp;T Stadium, NRG Stadium) until the game is played, and still attaches an outdoor forecast. Sift shows “Retractable roof · roof status not announced” and the outside forecast only as context, never as a game condition.</li>
        <li><b>International games forecast at the home team's US stadium.</b> The NFL weather capture reads the US National Weather Service at the designated home team's stadium, so a Jaguars “home” game at Tottenham Hotspur Stadium arrived with a Jacksonville forecast. Sift withholds any forecast whose kickoff hour is in a different time zone from the venue.</li>
        <li><b>Open-air stadiums listed as domes.</b> nflverse lists Melbourne Cricket Ground, Allianz Arena and Stade de France as domes. Sift shows the construction and marks the roof record as disputed.</li>
        <li><b>No weather in some sports.</b> The college football and MLB game publications carry no kickoff forecast; their pages say so instead of guessing.</li>
      </ul>
    </Stratum>
  );
}

const hours = (ms: number) => Math.round(ms / 3600_000);

export function InjurySourcesSection() {
  return (
    <Stratum id="injury-sources" title="Injury reports" sub={`Every injury list shows its source, when it was captured and its age: fresh up to ${hours(INJURY_FRESH_MS)} hours, aging up to ${hours(INJURY_STALE_MS)} hours, stale after that. This rule is for injury lists only; market prices keep their own 15- and 30-minute rule.`}>
      <table className="dtable">
        <thead><tr><th scope="col">Sport</th><th scope="col">Source</th><th scope="col">What to know</th></tr></thead>
        <tbody>
          <tr><th scope="row">NFL</th><td>ESPN injury report, captured by the NFL publication with each context run</td><td className="small">Designations are each team's official game status. Final at the inactive list, 90 minutes before kickoff.</td></tr>
          <tr><th scope="row">NBA</th><td>ESPN injury list</td><td className="small">The official NBA injury report is not captured, so this list can lag it.</td></tr>
          <tr><th scope="row">NHL</th><td>ESPN injury list</td><td className="small">Matched to players by name; injuries enter the NHL model only through the projected lineup.</td></tr>
          <tr><th scope="row">College football</th><td>Availability listing in the research data</td><td className="small">Not a depth chart; game pages show no injury list.</td></tr>
          <tr><th scope="row">MLB · Soccer · Tennis</th><td className="muted">No injury list published</td><td className="small">Screens say so rather than showing an empty list.</td></tr>
        </tbody>
      </table>
    </Stratum>
  );
}
