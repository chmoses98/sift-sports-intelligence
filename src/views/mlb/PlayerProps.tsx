// MLB player props on the game page: Pitchers, then Hitters; by player (away club first, lineup order); by stat; a
// ladder of thresholds. Each rung shows what YES means, the MARKET's implied probability (Kalshi bid/ask, live
// overlay applied by the caller) and, ONLY when the publisher's projection_status is a *_PROJECTION, the model's
// probability under a "Model" / "Model (research)" label. Any other status is shown as that status and its reason,
// never as a model number, and the market price never stands in for one. No edge, no confidence, no
// model-minus-market figure is computed for a prop, anywhere.
import { Link } from 'react-router';
import type { Market } from '../../contract/types';
import { Notice, TeamMark } from '../../components/ui';
import { cents, pct } from '../../lib/format';
import {
  describeMlbMarket, expectedLine, isMlbPlayerMarket, isProjected, mlbNick, mlbPlayerKey, mlbPlayerName, mlbTeamOf, modelLabel,
  propFamily, PROP_FAMILY_LABEL, propUnit, readPlayerProp, statusWords, type ExpectedStat, type PlayerProp, type PropValidation,
} from '../../lib/mlb';
import { routes } from '../../lib/routes';
import '../../styles/mlb.css';

export interface PropRow { m: Market; pp: PlayerProp | null; threshold: number | null }

export interface FamilyBlock {
  family: string;
  label: string;
  rows: PropRow[];
  expected: ExpectedStat | null;
  drivers: { label: string; value: string }[];
  research: boolean;
  verified: boolean;
  limitations: string[];
  validation: PropValidation | null;
  provenance: PlayerProp['provenance'];
  generatedAt: string | null;
  inputsAsOf: string | null;
}

export interface PlayerBlock {
  key: string;
  name: string;
  playerId: string | null;
  team: string | null;
  role: 'PITCHER' | 'HITTER';
  lineupStatus: string | null;
  lineupSlot: number | null;
  families: FamilyBlock[];
}

export interface PropBoard {
  /** True when at least one market carries extensions.player_prop. */
  projected: boolean;
  pitchers: PlayerBlock[];
  hitters: PlayerBlock[];
  /** Player markets without a player_prop object (shown as "No projection published"). */
  other: Market[];
}

const FAMILY_ORDER = ['pitcher_strikeouts', 'pitcher_outs', 'hitter_hits', 'hitter_total_bases', 'hitter_home_runs', 'hitter_hrr', 'hitter_rbi', 'hitter_runs', 'hitter_stolen_bases'];
const ord = (f: string) => (FAMILY_ORDER.indexOf(f) + 100) % 100;

function blocks(markets: Market[], usePp: boolean, teamOrder: string[], abbrOf?: (pid: string | null) => string | null): PlayerBlock[] {
  const players = new Map<string, PlayerBlock & { fam: Map<string, PropRow[]> }>();
  for (const m of markets) {
    const pp = usePp ? readPlayerProp(m) : null;
    const fam = pp?.family && pp.family !== 'unknown' ? pp.family : propFamily(m) ?? m.market_family;
    const key = mlbPlayerKey(m);
    let p = players.get(key);
    if (!p) {
      const role = pp?.role ?? (fam.startsWith('pitcher_') ? 'PITCHER' : 'HITTER');
      p = { key, name: pp?.playerName ?? mlbPlayerName(m) ?? 'Player', playerId: m.player_id ?? pp?.playerId ?? null, team: mlbTeamOf(m, abbrOf), role, lineupStatus: null, lineupSlot: null, families: [], fam: new Map() };
      players.set(key, p);
    }
    p.lineupStatus ??= pp?.lineupStatus ?? null;
    p.lineupSlot ??= pp?.lineupSlot ?? null;
    p.fam.set(fam, [...(p.fam.get(fam) ?? []), { m, pp, threshold: pp?.threshold ?? (m.threshold != null ? Number(m.threshold) : null) }]);
  }
  const out: PlayerBlock[] = [];
  for (const p of players.values()) {
    p.families = [...p.fam.entries()]
      .sort((a, b) => ord(a[0]) - ord(b[0]) || a[0].localeCompare(b[0]))
      .map(([family, rows]) => {
        rows.sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0) || a.m.kalshi_ticker.localeCompare(b.m.kalshi_ticker));
        const pps = rows.map((r) => r.pp).filter((x): x is PlayerProp => !!x);
        const projected = pps.filter((x) => isProjected(x.status));
        const lead = projected.find((x) => x.expected) ?? projected[0] ?? pps[0] ?? null;
        return {
          family, label: lead?.statLabel ?? PROP_FAMILY_LABEL[family] ?? family.replace(/_/g, ' '), rows,
          expected: projected.find((x) => x.expected)?.expected ?? null,
          drivers: (projected.find((x) => x.drivers.length)?.drivers ?? []).slice(0, 4),
          research: pps.some((x) => x.status === 'RESEARCH_PROJECTION'),
          verified: pps.some((x) => x.status === 'VERIFIED_PROJECTION'),
          limitations: [...new Set(pps.flatMap((x) => x.limitations))],
          validation: projected.find((x) => x.validation)?.validation ?? null,
          provenance: lead?.provenance ?? null,
          generatedAt: projected.find((x) => x.generatedAt)?.generatedAt ?? null,
          inputsAsOf: projected.find((x) => x.inputsAsOf)?.inputsAsOf ?? null,
        };
      });
    const { fam, ...rest } = p;
    void fam;
    out.push(rest);
  }
  const teamIdx = (t: string | null) => { const i = teamOrder.indexOf(t ?? ''); return i < 0 ? 99 : i; };
  return out.sort((a, b) => teamIdx(a.team) - teamIdx(b.team) || (a.lineupSlot ?? 99) - (b.lineupSlot ?? 99) || a.name.localeCompare(b.name));
}

/** The game's player markets, organised for the section. Pure: no number is created. */
export function propBoard(markets: Market[], teamOrder: string[], abbrOf?: (pid: string | null) => string | null): PropBoard {
  const props = markets.filter(isMlbPlayerMarket);
  const projected = props.some((m) => readPlayerProp(m));
  const supported = projected ? props.filter((m) => readPlayerProp(m)) : props;
  const all = blocks(supported, projected, teamOrder, abbrOf);
  return { projected, pitchers: all.filter((p) => p.role === 'PITCHER'), hitters: all.filter((p) => p.role === 'HITTER'), other: projected ? props.filter((m) => !readPlayerProp(m)) : [] };
}

/** The market's implied probability: the bid/ask midpoint, only when both sides are quoted. */
export function marketImplied(m: Pick<Market, 'yes_bid' | 'yes_ask'>): number | null {
  return m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 2 : null;
}

function MarketCell({ m }: { m: Market }) {
  const mid = marketImplied(m);
  return (
    <span className="pp__mkt" aria-label={`Market ${mid != null ? pct(mid, 0) : 'not quoted'}, bid ${cents(m.yes_bid)}, ask ${cents(m.yes_ask)}`}>
      <b className="num">{mid != null ? pct(mid, 0) : '—'}</b>
      <span className="pp__ba num">{cents(m.yes_bid)} / {cents(m.yes_ask)}</span>
    </span>
  );
}

function ModelCell({ pp }: { pp: PlayerProp | null }) {
  if (!pp) return <span className="pp__none">No projection published</span>;
  const label = modelLabel(pp.status);
  if (label && pp.modelProbabilityYes != null) {
    return <span className="pp__model" aria-label={`${label} ${pct(pp.modelProbabilityYes, 0)}`}><b className="num">{pct(pp.modelProbabilityYes, 0)}</b><span className="pp__ml">{label}</span></span>;
  }
  if (label) return <span className="pp__none">{label}: no probability published</span>;
  return (
    <span className="pp__status">
      <span className={`pp__badge pp__badge--${pp.status.toLowerCase()}`}>{statusWords(pp.status)}</span>
      {pp.statusReason && <span className="pp__reason">{pp.statusReason}</span>}
    </span>
  );
}

function Family({ f, slug, eventId }: { f: FamilyBlock; slug: string; eventId: string }) {
  const exp = expectedLine(f.expected, propUnit(f.family));
  const modelHead = f.verified && !f.research ? 'Model' : f.research ? 'Model (research)' : 'Model';
  const hasDetails = f.limitations.length > 0 || f.validation || f.provenance;
  return (
    <div className="pp__fam">
      <div className="pp__fh">
        <h5 className="pp__ft">{f.label}</h5>
        {exp && <span className="pp__exp num">{exp}</span>}
        {f.research && <span className="pp__research">Research — not validated for betting</span>}
      </div>
      {f.drivers.length > 0 && (
        <ul className="pp__drivers" aria-label={`${f.label}: key drivers`}>
          {f.drivers.map((d) => <li key={d.label}><span>{d.label}</span> <b className="num">{d.value}</b></li>)}
        </ul>
      )}
      <table className="pp__t">
        <thead>
          <tr><th scope="col">Line</th><th scope="col">YES means</th><th scope="col">Market</th><th scope="col">{modelHead}</th></tr>
        </thead>
        <tbody>
          {f.rows.map(({ m, pp, threshold }) => (
            <tr key={m.market_id}>
              <th scope="row" className="num"><Link to={routes.market(slug, m.market_id, eventId)}>{threshold != null ? `${threshold}+` : '—'}</Link></th>
              <td className="pp__yes">{pp?.yesSemantics ?? describeMlbMarket(m).title}</td>
              <td><MarketCell m={m} /></td>
              <td><ModelCell pp={pp} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasDetails && (
        <details className="pp__more">
          <summary>Limitations, validation &amp; provenance</summary>
          {f.limitations.length > 0 && <ul className="pp__lim">{f.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          {f.validation && (
            <p className="small">
              <b>Validation: {f.validation.status ?? 'not stated'}.</b> {f.validation.summary}
              {f.validation.n != null && <> · n = <span className="num">{f.validation.n}</span></>}
              {f.validation.modelBrier != null && <> · model Brier <span className="num">{f.validation.modelBrier.toFixed(4)}</span></>}
              {f.validation.marketBrier != null && <> · market Brier <span className="num">{f.validation.marketBrier.toFixed(4)}</span></>}
            </p>
          )}
          {f.provenance && (
            <p className="small muted">
              {[f.provenance.engine, f.provenance.engineVersion].filter(Boolean).join(' ')}{f.provenance.source ? ` · ${f.provenance.source}` : ''}
              {f.generatedAt ? ` · projected ${f.generatedAt.replace('T', ' ').slice(0, 16)} UTC` : ''}{f.inputsAsOf ? ` · inputs as of ${f.inputsAsOf.replace('T', ' ').slice(0, 16)} UTC` : ''}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

const LINEUP: Record<string, string> = { CONFIRMED: 'Lineup confirmed', PROJECTED: 'Lineup projected', UNCONFIRMED: 'Lineup unconfirmed' };

function Player({ p, slug, eventId, canLink }: { p: PlayerBlock; slug: string; eventId: string; canLink: (id: string | null) => boolean }) {
  return (
    <li className="pp__player">
      <div className="pp__ph">
        <TeamMark sport="MLB" abbr={p.team} size="sm" />
        <h4 className="pp__name">{p.playerId && canLink(p.playerId) ? <Link to={routes.player(slug, p.playerId)}>{p.name}</Link> : p.name}</h4>
        <span className="pp__team">{mlbNick(p.team) ?? ''}{p.lineupSlot != null ? ` · batting ${p.lineupSlot}` : ''}</span>
        {p.lineupStatus && <span className={`pp__lineup pp__lineup--${p.lineupStatus.toLowerCase()}`}>{LINEUP[p.lineupStatus] ?? p.lineupStatus}</span>}
      </div>
      {p.families.map((f) => <Family key={f.family} f={f} slug={slug} eventId={eventId} />)}
    </li>
  );
}

/** The Player Props section body. `markets` must already carry the live overlay. */
export function MlbPlayerProps({ markets, teamOrder, slug, eventId, canLink, abbrOf, limit }: {
  markets: Market[]; teamOrder: string[]; slug: string; eventId: string; canLink: (id: string | null) => boolean;
  abbrOf?: (pid: string | null) => string | null; limit?: { role: 'PITCHER' | 'HITTER' | null };
}) {
  const b = propBoard(markets, teamOrder, abbrOf);
  const groups: [string, PlayerBlock[]][] = [['Pitchers', b.pitchers], ['Hitters', b.hitters]];
  const shown = limit?.role ? groups.filter(([k]) => (limit.role === 'PITCHER' ? k === 'Pitchers' : k === 'Hitters')) : groups;
  if (!b.pitchers.length && !b.hitters.length && !b.other.length) return <p className="muted">No player-prop market is published for this game.</p>;
  const anyResearch = [...b.pitchers, ...b.hitters].some((p) => p.families.some((f) => f.research));
  return (
    <div className="pp">
      <p className="pp__key">
        <b>Market</b> = Kalshi's implied probability (bid/ask midpoint; bid / ask below it). <b>Model</b> appears only where the publisher released a
        projection for that rung; any other status is shown as a status with its reason. The two are never subtracted into a signal.
      </p>
      {anyResearch && !limit && (
        <Notice tone="research" title="Research — not validated for betting">Research projections are shown as evidence beside the market. They are not recommendations.</Notice>
      )}
      {!b.projected && (
        <Notice title="No projection published">The publication carries these player markets without a player-prop projection. Market prices only.</Notice>
      )}
      {shown.map(([label, ps]) => ps.length > 0 && (
        <section key={label} className="pp__role" aria-label={label}>
          <h3 className="pp__rt">{label}</h3>
          <ul className="pp__players">
            {ps.map((p) => <Player key={p.key} p={p} slug={slug} eventId={eventId} canLink={canLink} />)}
          </ul>
        </section>
      ))}
      {!limit && b.other.length > 0 && (
        <section className="pp__role pp__other" aria-label="Other player markets">
          <h3 className="pp__rt">Other player markets</h3>
          <ul className="pp__olist">
            {b.other.map((m) => (
              <li key={m.market_id}>
                <Link to={routes.market(slug, m.market_id, eventId)} className="pp__orow">
                  <span className="pp__od">{m.yes_description.replace(/\?\s*$/, '')}</span>
                  <MarketCell m={m} />
                  <span className="pp__none">No projection published</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
