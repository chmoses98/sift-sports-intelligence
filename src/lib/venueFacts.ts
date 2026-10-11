// Sift's venue facts table: the roof a venue is BUILT with, its playing surface and where it is, for every NFL stadium
// (2026 season plus the international sites the league uses), the indoor and retractable-roof venues that host college
// football, and every MLB park (plus its international sites). Most college stadiums are open-air and need no row: the
// hero venue registry (src/lib/hero/venues.json) already knows them.
//
// Provenance (checked 2026-10-11):
//   * Roof construction — public stadium records, cross-checked against nflverse schedules 2022–2026 (`roof` per game:
//     dome / closed / open / outdoors; a retractable roof shows as open/closed once a game is played and blank before)
//     and against the hero venue registry. Construction is a physical fact; whether a retractable roof is open for a
//     given game is NOT in this table — only a publication can say that.
//   * NFL surfaces — nflverse schedules, 2026 rows (`surface`); null where the 2026 rows disagree with each other.
//   * MLB surfaces — public park records (artificial turf: Chase Field, Globe Life Field, Rogers Centre, Tropicana
//     Field, loanDepot park).
//   * Time zones — the IANA zone of the venue; used to check that a published kickoff forecast is for this place.
// A publication's own per-game roof field outranks this table for roof STATUS (open/closed); when a publication's roof
// contradicts the construction here (e.g. "dome" for an open-air stadium) Sift shows the construction and says so.
import { normName } from './hero/registry';

export type RoofType = 'dome' | 'retractable' | 'open';
export type Surface = 'grass' | 'artificial';

export interface VenueFact {
  /** Same id as the hero venue registry when the venue is there. */
  id: string;
  name: string;
  /** Other names the publications use (former names, nflverse spellings). */
  aliases?: string[];
  city: string;
  /** ISO 3166 alpha-2. */
  country: string;
  /** IANA time zone. */
  tz: string;
  roof: RoofType;
  surface: Surface | null;
  /** Home tenants by sport (codes as the publications use them). */
  tenants: { sport: string; team: string }[];
  note?: string;
}

const NFL = (team: string | string[]) => (Array.isArray(team) ? team : [team]).map((t) => ({ sport: 'NFL', team: t }));
const CFB = (team: string) => [{ sport: 'CFB', team }];
const MLB = (team: string) => [{ sport: 'MLB', team }];
const ET = 'America/New_York';
const CT = 'America/Chicago';
const MT = 'America/Denver';
const PT = 'America/Los_Angeles';

export const VENUE_FACTS: VenueFact[] = [
  // ------------------------------------------------------------------ NFL home stadiums, 2026
  { id: 'state-farm-stadium', name: 'State Farm Stadium', aliases: ['University of Phoenix Stadium', 'Cardinals Stadium'], city: 'Glendale, AZ', country: 'US', tz: 'America/Phoenix', roof: 'retractable', surface: 'grass', tenants: [...NFL('ARI')], note: 'Retractable roof; the grass field rolls outside between games.' },
  { id: 'mercedes-benz-stadium', name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', country: 'US', tz: ET, roof: 'retractable', surface: 'artificial', tenants: [...NFL('ATL')] },
  { id: 'mt-bank-stadium', name: 'M&T Bank Stadium', city: 'Baltimore, MD', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('BAL') },
  { id: 'highmark-stadium', name: 'Highmark Stadium', aliases: ['New Highmark Stadium'], city: 'Orchard Park, NY', country: 'US', tz: ET, roof: 'open', surface: null, tenants: NFL('BUF'), note: 'Opened 2026; nflverse 2026 rows disagree on the surface.' },
  { id: 'bank-of-america-stadium', name: 'Bank of America Stadium', city: 'Charlotte, NC', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('CAR') },
  { id: 'soldier-field', name: 'Soldier Field', city: 'Chicago, IL', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: NFL('CHI') },
  { id: 'paycor-stadium', name: 'Paycor Stadium', aliases: ['Paul Brown Stadium'], city: 'Cincinnati, OH', country: 'US', tz: ET, roof: 'open', surface: 'artificial', tenants: NFL('CIN') },
  { id: 'huntington-bank-field', name: 'Huntington Bank Field', aliases: ['FirstEnergy Stadium', 'Cleveland Browns Stadium'], city: 'Cleveland, OH', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('CLE') },
  { id: 'att-stadium', name: 'AT&T Stadium', aliases: ['Cowboys Stadium'], city: 'Arlington, TX', country: 'US', tz: CT, roof: 'retractable', surface: 'artificial', tenants: NFL('DAL') },
  { id: 'empower-field', name: 'Empower Field at Mile High', city: 'Denver, CO', country: 'US', tz: MT, roof: 'open', surface: 'grass', tenants: NFL('DEN') },
  { id: 'ford-field', name: 'Ford Field', city: 'Detroit, MI', country: 'US', tz: 'America/Detroit', roof: 'dome', surface: 'artificial', tenants: NFL('DET') },
  { id: 'lambeau-field', name: 'Lambeau Field', city: 'Green Bay, WI', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: NFL('GB') },
  { id: 'nrg-stadium', name: 'NRG Stadium', aliases: ['Reliant Stadium'], city: 'Houston, TX', country: 'US', tz: CT, roof: 'retractable', surface: 'artificial', tenants: NFL('HOU'), note: 'nflverse 2026 rows still call it Reliant Stadium.' },
  { id: 'lucas-oil-stadium', name: 'Lucas Oil Stadium', city: 'Indianapolis, IN', country: 'US', tz: 'America/Indiana/Indianapolis', roof: 'retractable', surface: 'artificial', tenants: NFL('IND') },
  { id: 'everbank-stadium', name: 'EverBank Stadium', aliases: ['EverBank Field', 'TIAA Bank Field', 'TIAA Bank Stadium'], city: 'Jacksonville, FL', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('JAX') },
  { id: 'arrowhead-stadium', name: 'GEHA Field at Arrowhead Stadium', aliases: ['Arrowhead Stadium'], city: 'Kansas City, MO', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: NFL('KC') },
  { id: 'allegiant-stadium', name: 'Allegiant Stadium', city: 'Paradise, NV', country: 'US', tz: PT, roof: 'dome', surface: 'grass', tenants: [...NFL('LV'), ...CFB('UNLV')], note: 'Fixed roof; the grass field rolls in on a tray.' },
  { id: 'sofi-stadium', name: 'SoFi Stadium', city: 'Inglewood, CA', country: 'US', tz: PT, roof: 'dome', surface: 'artificial', tenants: NFL(['LAC', 'LA', 'LAR']), note: 'Fixed translucent roof with open sides; publications list it as a dome.' },
  { id: 'hard-rock-stadium', name: 'Hard Rock Stadium', city: 'Miami Gardens, FL', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: [...NFL('MIA'), ...CFB('MIA')], note: 'A canopy covers the stands, not the field.' },
  { id: 'us-bank-stadium', name: 'U.S. Bank Stadium', city: 'Minneapolis, MN', country: 'US', tz: CT, roof: 'dome', surface: 'artificial', tenants: NFL('MIN') },
  { id: 'gillette-stadium', name: 'Gillette Stadium', city: 'Foxborough, MA', country: 'US', tz: ET, roof: 'open', surface: 'artificial', tenants: NFL('NE') },
  { id: 'caesars-superdome', name: 'Caesars Superdome', aliases: ['Mercedes-Benz Superdome', 'Louisiana Superdome'], city: 'New Orleans, LA', country: 'US', tz: CT, roof: 'dome', surface: 'artificial', tenants: NFL('NO') },
  { id: 'metlife-stadium', name: 'MetLife Stadium', city: 'East Rutherford, NJ', country: 'US', tz: ET, roof: 'open', surface: 'artificial', tenants: NFL(['NYG', 'NYJ']) },
  { id: 'lincoln-financial-field', name: 'Lincoln Financial Field', city: 'Philadelphia, PA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('PHI') },
  { id: 'acrisure-stadium', name: 'Acrisure Stadium', aliases: ['Heinz Field'], city: 'Pittsburgh, PA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('PIT') },
  { id: 'levis-stadium', name: "Levi's Stadium", city: 'Santa Clara, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: NFL('SF') },
  { id: 'lumen-field', name: 'Lumen Field', city: 'Seattle, WA', country: 'US', tz: PT, roof: 'open', surface: 'artificial', tenants: NFL('SEA'), note: 'Partial roof over the stands only.' },
  { id: 'raymond-james-stadium', name: 'Raymond James Stadium', city: 'Tampa, FL', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('TB') },
  { id: 'nissan-stadium', name: 'Nissan Stadium', city: 'Nashville, TN', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: NFL('TEN'), note: 'The enclosed new Nissan Stadium opens in 2027.' },
  { id: 'northwest-stadium', name: 'Northwest Stadium', aliases: ['FedExField', 'FedEx Field', 'Commanders Field'], city: 'Landover, MD', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: NFL('WAS') },

  // ------------------------------------------------------------------ NFL international and neutral sites
  { id: 'tottenham-hotspur-stadium', name: 'Tottenham Hotspur Stadium', aliases: ['Tottenham Stadium'], city: 'London, UK', country: 'GB', tz: 'Europe/London', roof: 'open', surface: null, tenants: [] },
  { id: 'wembley-stadium', name: 'Wembley Stadium', city: 'London, UK', country: 'GB', tz: 'Europe/London', roof: 'open', surface: 'grass', tenants: [], note: 'Roof over the stands only.' },
  { id: 'allianz-arena', name: 'Allianz Arena', aliases: ['FC Bayern Munich Stadium', 'Fußball Arena München', 'Munich Football Arena'], city: 'Munich, Germany', country: 'DE', tz: 'Europe/Berlin', roof: 'open', surface: null, tenants: [], note: 'Roof over the stands only; nflverse lists it as a dome.' },
  { id: 'deutsche-bank-park', name: 'Deutsche Bank Park', aliases: ['Frankfurt Stadium', 'Commerzbank-Arena', 'Waldstadion'], city: 'Frankfurt, Germany', country: 'DE', tz: 'Europe/Berlin', roof: 'retractable', surface: null, tenants: [] },
  { id: 'olympiastadion-berlin', name: 'Olympiastadion', aliases: ['Olympiastadion Berlin'], city: 'Berlin, Germany', country: 'DE', tz: 'Europe/Berlin', roof: 'open', surface: null, tenants: [] },
  { id: 'santiago-bernabeu', name: 'Santiago Bernabéu', aliases: ['Bernabeu', 'Estadio Santiago Bernabéu', 'Santiago Bernabéu Stadium'], city: 'Madrid, Spain', country: 'ES', tz: 'Europe/Madrid', roof: 'retractable', surface: null, tenants: [] },
  { id: 'stade-de-france', name: 'Stade de France', city: 'Saint-Denis, France', country: 'FR', tz: 'Europe/Paris', roof: 'open', surface: null, tenants: [], note: 'Roof over the stands only; nflverse lists it as a dome.' },
  { id: 'croke-park', name: 'Croke Park', city: 'Dublin, Ireland', country: 'IE', tz: 'Europe/Dublin', roof: 'open', surface: null, tenants: [] },
  { id: 'melbourne-cricket-ground', name: 'Melbourne Cricket Ground', aliases: ['MCG'], city: 'Melbourne, Australia', country: 'AU', tz: 'Australia/Melbourne', roof: 'open', surface: null, tenants: [], note: 'Open-air; nflverse lists it as a dome.' },
  { id: 'maracana', name: 'Estádio do Maracanã', aliases: ['Maracana Stadium', 'Maracanã', 'Estadio do Maracana'], city: 'Rio de Janeiro, Brazil', country: 'BR', tz: 'America/Sao_Paulo', roof: 'open', surface: null, tenants: [] },
  { id: 'neo-quimica-arena', name: 'Neo Química Arena', aliases: ['Arena Corinthians', 'Corinthians Arena'], city: 'São Paulo, Brazil', country: 'BR', tz: 'America/Sao_Paulo', roof: 'open', surface: null, tenants: [] },
  { id: 'estadio-azteca', name: 'Estadio Azteca', aliases: ['Estadio Banorte', 'Azteca Stadium', 'Estadio Ciudad de México'], city: 'Mexico City, Mexico', country: 'MX', tz: 'America/Mexico_City', roof: 'open', surface: null, tenants: [] },

  // ------------------------------------------------------------------ college football: indoor and retractable venues
  { id: 'alamodome', name: 'Alamodome', city: 'San Antonio, TX', country: 'US', tz: CT, roof: 'dome', surface: 'artificial', tenants: CFB('UTSA') },
  { id: 'jma-wireless-dome', name: 'JMA Wireless Dome', aliases: ['Carrier Dome'], city: 'Syracuse, NY', country: 'US', tz: ET, roof: 'dome', surface: 'artificial', tenants: CFB('SYR') },
  { id: 'kibbie-dome', name: 'Kibbie Dome', aliases: ['ASUI Kibbie Activity Center', 'P1FCU Kibbie Dome'], city: 'Moscow, ID', country: 'US', tz: PT, roof: 'dome', surface: 'artificial', tenants: CFB('IDHO') },
  { id: 'holt-arena', name: 'Holt Arena', aliases: ['ICCU Dome'], city: 'Pocatello, ID', country: 'US', tz: MT, roof: 'dome', surface: 'artificial', tenants: CFB('IDST') },
  { id: 'uni-dome', name: 'UNI-Dome', aliases: ['UNI Dome'], city: 'Cedar Falls, IA', country: 'US', tz: CT, roof: 'dome', surface: 'artificial', tenants: CFB('UNI') },
  { id: 'walkup-skydome', name: 'Walkup Skydome', aliases: ['J. Lawrence Walkup Skydome'], city: 'Flagstaff, AZ', country: 'US', tz: 'America/Phoenix', roof: 'dome', surface: 'artificial', tenants: CFB('NAU') },
  { id: 'tropicana-field', name: 'Tropicana Field', city: 'St. Petersburg, FL', country: 'US', tz: ET, roof: 'dome', surface: 'artificial', tenants: MLB('TB') },

  // ------------------------------------------------------------------ MLB parks, 2026
  { id: 'chase-field', name: 'Chase Field', aliases: ['Bank One Ballpark'], city: 'Phoenix, AZ', country: 'US', tz: 'America/Phoenix', roof: 'retractable', surface: 'artificial', tenants: MLB('AZ') },
  { id: 'sutter-health-park', name: 'Sutter Health Park', city: 'West Sacramento, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: MLB('ATH') },
  { id: 'truist-park', name: 'Truist Park', city: 'Atlanta, GA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('ATL') },
  { id: 'camden-yards', name: 'Oriole Park at Camden Yards', aliases: ['Camden Yards'], city: 'Baltimore, MD', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('BAL') },
  { id: 'fenway-park', name: 'Fenway Park', city: 'Boston, MA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('BOS') },
  { id: 'wrigley-field', name: 'Wrigley Field', city: 'Chicago, IL', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: MLB('CHC') },
  { id: 'rate-field', name: 'Rate Field', aliases: ['Guaranteed Rate Field'], city: 'Chicago, IL', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: MLB('CWS') },
  { id: 'great-american-ball-park', name: 'Great American Ball Park', city: 'Cincinnati, OH', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('CIN') },
  { id: 'progressive-field', name: 'Progressive Field', city: 'Cleveland, OH', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('CLE') },
  { id: 'coors-field', name: 'Coors Field', city: 'Denver, CO', country: 'US', tz: MT, roof: 'open', surface: 'grass', tenants: MLB('COL') },
  { id: 'comerica-park', name: 'Comerica Park', city: 'Detroit, MI', country: 'US', tz: 'America/Detroit', roof: 'open', surface: 'grass', tenants: MLB('DET') },
  { id: 'daikin-park', name: 'Daikin Park', aliases: ['Minute Maid Park'], city: 'Houston, TX', country: 'US', tz: CT, roof: 'retractable', surface: 'grass', tenants: MLB('HOU') },
  { id: 'kauffman-stadium', name: 'Kauffman Stadium', city: 'Kansas City, MO', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: MLB('KC') },
  { id: 'angel-stadium', name: 'Angel Stadium', city: 'Anaheim, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: MLB('LAA') },
  { id: 'dodger-stadium', name: 'Dodger Stadium', city: 'Los Angeles, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: MLB('LAD') },
  { id: 'loandepot-park', name: 'loanDepot park', aliases: ['Marlins Park'], city: 'Miami, FL', country: 'US', tz: ET, roof: 'retractable', surface: 'artificial', tenants: MLB('MIA') },
  { id: 'american-family-field', name: 'American Family Field', aliases: ['Miller Park'], city: 'Milwaukee, WI', country: 'US', tz: CT, roof: 'retractable', surface: 'grass', tenants: MLB('MIL') },
  { id: 'target-field', name: 'Target Field', city: 'Minneapolis, MN', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: MLB('MIN') },
  { id: 'citi-field', name: 'Citi Field', city: 'Queens, NY', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('NYM') },
  { id: 'yankee-stadium', name: 'Yankee Stadium', city: 'Bronx, NY', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('NYY') },
  { id: 'citizens-bank-park', name: 'Citizens Bank Park', city: 'Philadelphia, PA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('PHI') },
  { id: 'pnc-park', name: 'PNC Park', city: 'Pittsburgh, PA', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('PIT') },
  { id: 'petco-park', name: 'Petco Park', city: 'San Diego, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: MLB('SD') },
  { id: 'oracle-park', name: 'Oracle Park', city: 'San Francisco, CA', country: 'US', tz: PT, roof: 'open', surface: 'grass', tenants: MLB('SF') },
  { id: 't-mobile-park', name: 'T-Mobile Park', aliases: ['Safeco Field'], city: 'Seattle, WA', country: 'US', tz: PT, roof: 'retractable', surface: 'grass', tenants: MLB('SEA'), note: 'The roof covers the field but does not enclose the park.' },
  { id: 'busch-stadium', name: 'Busch Stadium', city: 'St. Louis, MO', country: 'US', tz: CT, roof: 'open', surface: 'grass', tenants: MLB('STL') },
  { id: 'globe-life-field', name: 'Globe Life Field', city: 'Arlington, TX', country: 'US', tz: CT, roof: 'retractable', surface: 'artificial', tenants: MLB('TEX') },
  { id: 'rogers-centre', name: 'Rogers Centre', aliases: ['SkyDome'], city: 'Toronto, ON', country: 'CA', tz: 'America/Toronto', roof: 'retractable', surface: 'artificial', tenants: MLB('TOR') },
  { id: 'nationals-park', name: 'Nationals Park', city: 'Washington, DC', country: 'US', tz: ET, roof: 'open', surface: 'grass', tenants: MLB('WSH') },
  // MLB international sites
  { id: 'tokyo-dome', name: 'Tokyo Dome', city: 'Tokyo, Japan', country: 'JP', tz: 'Asia/Tokyo', roof: 'dome', surface: 'artificial', tenants: [] },
  { id: 'gocheok-sky-dome', name: 'Gocheok Sky Dome', city: 'Seoul, South Korea', country: 'KR', tz: 'Asia/Seoul', roof: 'dome', surface: 'artificial', tenants: [] },
  { id: 'london-stadium', name: 'London Stadium', city: 'London, UK', country: 'GB', tz: 'Europe/London', roof: 'open', surface: null, tenants: [] },
  { id: 'estadio-alfredo-harp-helu', name: 'Estadio Alfredo Harp Helú', city: 'Mexico City, Mexico', country: 'MX', tz: 'America/Mexico_City', roof: 'open', surface: null, tenants: [] },
];

const BY_ID = new Map(VENUE_FACTS.map((v) => [v.id, v]));
const BY_NAME = new Map<string, VenueFact>();
for (const v of VENUE_FACTS) for (const n of [v.name, ...(v.aliases ?? [])]) BY_NAME.set(normName(n), v);

/** The venue facts row for a hero venue id or a published venue name (aliases included), else null. */
export function venueFact(idOrName: string | null | undefined, name?: string | null): VenueFact | null {
  if (idOrName && BY_ID.has(idOrName)) return BY_ID.get(idOrName)!;
  for (const n of [idOrName, name]) {
    if (!n) continue;
    const hit = BY_NAME.get(normName(n));
    if (hit) return hit;
  }
  return null;
}

/** A team's home venue in this table (the first listed), for a sport. */
export function homeVenueFact(sport: string, team: string | null | undefined): VenueFact | null {
  if (!team) return null;
  const t = team.toUpperCase();
  return VENUE_FACTS.find((v) => v.tenants.some((x) => x.sport === sport && x.team === t)) ?? null;
}

export const ROOF_WORD: Record<RoofType, string> = { dome: 'Dome (fixed roof)', retractable: 'Retractable roof', open: 'Open-air' };
export const SURFACE_WORD: Record<Surface, string> = { grass: 'Natural grass', artificial: 'Artificial turf' };
