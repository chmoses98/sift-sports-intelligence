// An NBA game page: both clubs, tipoff and arena; the honest model status for this game (research only, no model
// prices in this publication); the opponent-ranked matchup; the injury report; the roster the publication projects;
// every market with prices only (the model prices none); and the publication's own caveats.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Market } from '../../contract/types';
import { latestPrices } from '../../components/MarketBoard';
import { ErrorState, QualityBadge, Skeleton, TeamMark } from '../../components/ui';
import { useAsync } from '../../data/hooks';
import { kickoff, until } from '../../lib/format';
import { NBA_FAMILY_LABEL, nbaCaveats, nbaFamilyLabel, nbaInjuries, nbaMarketTitle, nbaModelVsMarket, nbaTeam, nbaVenue } from '../../lib/nba';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import { teamAccent } from '../../lib/teams';
import { Authority, Deep, MarketFamilies, Pill, RankRows, Section } from '../shared/kit';

const STATUS_WORD: Record<string, string> = { OUT: 'Out', DOUBTFUL: 'Doubtful', QUESTIONABLE: 'Questionable', PROBABLE: 'Probable', DAY_TO_DAY: 'Day to day' };

export function NbaGameView({ eventId }: { eventId: string }) {
  const { sport, repo, slug, metrics } = useSport();
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const detail = useAsync(`ed:${sport.code}:${eventId}`, () => repo.eventDetail(eventId));
  const now = useNow(15_000);
  const r = research.data;
  const homeP = r?.participants.find((p) => p.home_away === 'HOME');
  const awayP = r?.participants.find((p) => p.home_away === 'AWAY');
  const short = (pid?: string | null) => r?.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  useVisit(r ? `${short(awayP?.participant_id)} @ ${short(homeP?.participant_id)}` : null, 'game');
  const markets = useMemo(() => detail.data?.markets ?? [], [detail.data]);
  const prices = useMemo(() => latestPrices(detail.data?.model_prices ?? []), [detail.data]);
  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  if (!r || !homeP || !awayP) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const homeAbbr = short(homeP.participant_id);
  const awayAbbr = short(awayP.participant_id);
  const ht = nbaTeam(homeAbbr);
  const at = nbaTeam(awayAbbr);
  const venue = nbaVenue(r);
  const inj = nbaInjuries(r);
  const caveats = nbaCaveats(r);
  const families = nbaModelVsMarket(r);
  const abbrOf = (pid: string | null) => (pid === homeP.participant_id ? homeAbbr : pid === awayP.participant_id ? awayAbbr : null);
  const title = (m: Market) => nbaMarketTitle(m, abbrOf);
  const started = Date.parse(r.event.start_time_utc) <= now;
  const roster = (tid: string) => r.players.filter((p) => p.team_id === tid).sort((a, b) => (a.role ?? '').localeCompare(b.role ?? '') || a.display_name.localeCompare(b.display_name));
  const notes = r.context?.notes ?? [];
  return (
    <div className="page nba-game" style={{ ['--team' as string]: teamAccent('NBA', homeAbbr) }}>
      <header className="skh">
        <div className="skh__title">
          <span className="eyebrow">NBA{r.event.competition ? ` · ${r.event.competition}` : ''}{r.event.season ? ` · ${r.event.season}` : ''}</span>
          <div className="skvs">
            <div className="skvs__side"><TeamMark sport="NBA" abbr={awayAbbr} size="xl" /><Link to={routes.team(slug, awayP.participant_id)} className="skvs__name">{at ? `${at.city} ${at.name}` : awayP.display_name}</Link><span className="skvs__sub">away</span></div>
            <div className="skvs__mid"><b>at</b><span>{kickoff(r.event.start_time_utc)}</span><span>{started ? 'Tipped off' : until(r.event.start_time_utc, now)}</span></div>
            <div className="skvs__side skvs__side--r"><TeamMark sport="NBA" abbr={homeAbbr} size="xl" /><Link to={routes.team(slug, homeP.participant_id)} className="skvs__name">{ht ? `${ht.city} ${ht.name}` : homeP.display_name}</Link><span className="skvs__sub">{venue.neutral ? 'neutral site' : 'home'}</span></div>
          </div>
          <span className="skh__sub">{venue.arena ?? 'Arena not published'}{venue.neutral ? ' · neutral site' : ''}</span>
        </div>
        <div className="skh__right"><div className="skh__status"><Pill tone="research">model prices none of these markets</Pill><Authority value="RESEARCH" /></div></div>
      </header>

      <Section id="ng-read" title="The research read" sub="What the publication can and cannot say about this game.">
        <div className="skopp skopp--pass">
          <div className="skopp__eyebrow">Pass <Pill tone="neutral">no model price</Pill></div>
          <h2 className="skopp__t">No defensible opportunity: this publication prices no NBA contract, and its own study says the market beats its model.</h2>
          <p className="skopp__why">{caveats[0] ?? 'Every NBA family is RESEARCH authority.'} Sift shows the matchup, the injury report, the projected roster and every price so you can read the game; it derives no edge.</p>
          {caveats.length > 1 && <Deep summary={`${caveats.length - 1} more published caveats`}><ul className="lims">{caveats.slice(1).map((c) => <li key={c}>{c}</li>)}</ul></Deep>}
        </div>
      </Section>

      <Section id="ng-matchup" title="Matchup" sub="Last season's team metrics with each club's rank of 30; schedule strength and the market-implied win probability where published.">
        <RankRows rows={r.matchup} metrics={metrics} left={{ label: at?.name ?? awayAbbr, side: 'away' }} right={{ label: ht?.name ?? homeAbbr, side: 'home' }} leftId={awayP.participant_id} rightId={homeP.participant_id} slug={slug} eventId={eventId} universeNoun="NBA teams" />
      </Section>

      <div className="skgrid">
        <Section id="ng-inj" title="Injury report" sub={inj[0]?.source ? `${inj[0].source}${inj[0].asOf ? ` · as of ${kickoff(inj[0].asOf)}` : ''}` : 'No injury rows published for this game.'}>
          {inj.length === 0 ? <p className="muted">Nobody listed.</p> : (
            <ul className="lims">{inj.map((i) => <li key={`${i.player}-${i.status}`}><b>{i.player}</b>{i.team ? ` (${i.team})` : ''} · {STATUS_WORD[i.status] ?? i.status.toLowerCase()}{i.detail ? ` · ${i.detail}` : ''}</li>)}</ul>
          )}
        </Section>
        <Section id="ng-roster" title="Rosters the publication projects" sub="Players the research document lists for each club. Open one for last season's game log and per-game rates.">
          <div className="skgrid">
            {[[awayP.participant_id, awayAbbr], [homeP.participant_id, homeAbbr]].map(([tid, ab]) => (
              <div key={tid} className="skpanel">
                <h3 className="skpanel__t"><TeamMark sport="NBA" abbr={ab} size="sm" /> {ab}</h3>
                {roster(tid).length === 0 ? <p className="muted small">No roster published.</p> : <ul className="lims">{roster(tid).map((p) => <li key={p.participant_id}><Link to={routes.player(slug, p.participant_id)}>{p.display_name}</Link> <span className="muted">{p.role}</span></li>)}</ul>}
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section id="ng-markets" title="Markets" sub={`Every Kalshi contract on this game (${markets.length}). Prices only: the publication prices none of them.`}>
        {detail.loading && <Skeleton lines={5} />}
        {detail.error && <ErrorState error={detail.error} what="this game's markets" />}
        {detail.data && <MarketFamilies markets={markets} prices={prices} projections={r.projections} title={title} familyLabel={nbaFamilyLabel} order={Object.keys(NBA_FAMILY_LABEL)} slug={slug} eventId={eventId} now={now} authority="RESEARCH" />}
      </Section>

      {families.length > 0 && (
        <Section id="ng-study" title="Model against the market" sub="The publication's out-of-sample walk-forward, by family. Lower log loss is better; the market wins every row.">
          <div className="tscroll"><table className="dtable">
            <thead><tr><th scope="col">Family</th><th scope="col" className="r">n</th><th scope="col" className="r">Market</th><th scope="col" className="r">Model</th><th scope="col" className="r">Hybrid</th></tr></thead>
            <tbody>{families.map((f) => <tr key={f.family}><th scope="row">{f.family.replace(/_/g, ' ')}</th><td className="r num">{f.nOos.toLocaleString('en-US')}</td><td className="r num">{f.marketLogLoss?.toFixed(3) ?? '—'}</td><td className="r num">{f.modelLogLoss?.toFixed(3) ?? '—'}</td><td className="r num">{f.hybridLogLoss?.toFixed(3) ?? '—'}{f.hybridBeatsMarket ? <span className="muted" title="The publication's hybrid (market-anchored) variant beat the calibrated market in this family out of sample"> ✓</span> : null}</td></tr>)}</tbody>
          </table></div>
        </Section>
      )}

      <details className="gnotes">
        <summary>Publication notes & provenance</summary>
        {notes.length > 0 && <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source ?? ''} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
      </details>
    </div>
  );
}
