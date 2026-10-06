// The CBB game page: a basketball research surface, not NFL components forced onto basketball.
// Hierarchy: who/when/where → the pre-tip projection (incumbent) with model uncertainty → roster truth
// and the expected rotation → opponent-adjusted matchup → model comparison → research status → markets
// → data & provenance. Every number is read from the event research document the CBB publisher built
// from its immutable pre-tip archive; nothing here computes a projection or an edge.
import { Link } from 'react-router';
import type { EventResearchDoc, Observation, Participant } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { Icon } from '../../components/Icon';
import { ErrorState, Notice, QualityBadge, Skeleton, Stratum } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useSport } from '../../state/sport';
import { useVisit } from '../../state/trail';
import {
  CONFIDENCE_TEXT, fmt1, marginWords, pct0, researchExt, shortSha, signed1, stampTime, teamShort, tipLabel,
  type CbbResearchExt, type ModelRow, type ProsterSide, type RotationPlayer, type TeamRoster,
} from './data';
import { AsOf, CbbMark, ConfidenceChip, IntegrityBadge, KV, RoleTag, StateLine } from './ui';

export function CbbGameView({ eventId }: { eventId: string }) {
  const { sport, repo, slug } = useSport();
  const research = useAsync(`er:${sport.code}:${eventId}`, () => repo.eventResearch(eventId));
  const now = useNow(30_000);
  const r = research.data;
  const ev = r?.event;
  const home = ev?.participants.find((p) => p.participant_id === ev.home_participant);
  const away = ev?.participants.find((p) => p.participant_id === ev.away_participant);
  useVisit(ev ? `${teamShort(away)} at ${teamShort(home)}` : null, 'game');
  if (research.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  const c = researchExt(r);
  if (!r || !ev || !home || !away || !c) return <div className="page"><ErrorState error={research.error} what="this game's research" /></div>;
  const hn = teamShort(home);
  const an = teamShort(away);
  const primary = c.models_detail.find((m) => m.version === c.primary_version) ?? null;
  return (
    <div className="page cbbg">
      <Hero r={r} c={c} home={home} away={away} slug={slug} now={now} />
      <nav className="cbbg__toc" aria-label="Game sections">
        <a href="#cg-proj">Projection</a><a href="#cg-roster">Rosters</a><a href="#cg-matchup">Matchup</a>
        <a href="#cg-models">Models</a><a href="#cg-status">Research status</a><a href="#cg-prov">Data &amp; provenance</a>
      </nav>

      <Stratum id="cg-proj" title="Projected score" sub={primary ? 'The production incumbent’s projection, archived before tip. Research evidence, never a pick.' : undefined}>
        {primary ? <ProjectionBlock m={primary} hn={hn} an={an} c={c} now={now} /> : <NoProjection c={c} />}
        {c.result && <ResultLine c={c} hn={hn} an={an} />}
      </Stratum>

      <Stratum id="cg-roster" title="Roster situation" sub={c.roster.basis_text}>
        <Rosters c={c} home={home} away={away} slug={slug} />
      </Stratum>

      <Stratum id="cg-matchup" title="Opponent-adjusted matchup" sub="Each offense against the defense it faces, on ratings adjusted for opponent strength inside the model fit (vs an average D-I team).">
        <Matchup r={r} c={c} an={an} hn={hn} slug={slug} />
      </Stratum>

      <Stratum id="cg-models" title="Model comparison" sub={c.model_order_note}>
        <ModelComparison c={c} hn={hn} an={an} />
      </Stratum>

      <Stratum id="cg-status" title="Research status" sub="Prospective evaluation of the frozen models: what this game will count for, and nothing more.">
        <ResearchStatus c={c} />
      </Stratum>

      <Stratum id="cg-markets" title="Markets">
        {r.markets.length ? (
          <ul className="cbbmk">
            {r.markets.map((m) => (
              <li key={m.market_id}><Link to={routes.market(slug, m.market_id, ev.event_id)}>{m.yes_description}</Link> <span className="num muted">{m.yes_bid != null ? `${Math.round(m.yes_bid * 100)}¢` : '—'} / {m.yes_ask != null ? `${Math.round(m.yes_ask * 100)}¢` : '—'}</span></li>
            ))}
          </ul>
        ) : (
          <p className="muted">Market research is not published for CBB yet: no Kalshi game contract maps to this game. Projections are shown without any market comparison.</p>
        )}
      </Stratum>

      <p className="cbbg__packet">
        <Link className="btn btn--sm" to={routes.packet({ sport: slug, scope: 'GAME', event: ev.event_id })}><Icon name="copy" size={14} /> Copy for ChatGPT</Link>
        <span className="muted small">A research packet: projection rows, rosters, opponent-adjusted ratings and the prospective sample. Evidence, not instructions.</span>
      </p>

      <Provenance r={r} c={c} now={now} />
    </div>
  );
}

function Hero({ r, c, home, away, slug, now }: { r: EventResearchDoc; c: CbbResearchExt; home: Participant; away: Participant; slug: string; now: number }) {
  const ev = r.event;
  const conf = (p: Participant) => (typeof p.metadata?.conference === 'string' ? p.metadata.conference : null);
  const venue = [c.venue.name, c.venue.city, c.venue.region].filter(Boolean).join(', ');
  return (
    <header className="cbbh">
      <div className="cbbh__eyebrow">
        <span>{tipLabel(ev.start_time_utc, c)}</span>
        {c.tbd && <span className="cbbh__tag">Tip time TBD</span>}
        {c.neutral_site && <span className="cbbh__tag">Neutral site</span>}
        {c.event_name && <span className="cbbh__tag">{c.event_name}</span>}
        {c.conference_game && <span className="cbbh__tag">Conference game</span>}
        {ev.status !== 'SCHEDULED' && <span className="cbbh__tag cbbh__tag--st">{ev.status.toLowerCase()}</span>}
      </div>
      <h1 className="cbbh__teams">
        {[away, home].map((p, i) => (
          <span key={p.participant_id} className="cbbh__side">
            {i === 1 && <span className="cbbh__at" aria-hidden="true">{c.neutral_site ? 'vs' : '@'}</span>}
            <Link to={routes.team(slug, p.participant_id)} className="cbbh__team">
              <CbbMark p={p} size="lg" />
              <span className="cbbh__name">{teamShort(p)}<span className="cbbh__conf">{conf(p) ?? ''}</span></span>
            </Link>
          </span>
        ))}
      </h1>
      <p className="cbbh__meta">
        {venue && <span><Icon name="pin" size={13} /> {venue}</span>}
        <StateLine state={c.projection_state} compact />
        {c.primary && <AsOf iso={c.primary.as_of} label="projection archived" now={now} />}
      </p>
      <div className="cbbh__conf2">
        <ConfidenceChip c={c.roster_confidence.away} team={teamShort(away)} />
        <ConfidenceChip c={c.roster_confidence.home} team={teamShort(home)} />
      </div>
    </header>
  );
}

function ProjectionBlock({ m, hn, an, c, now }: { m: ModelRow; hn: string; an: string; c: CbbResearchExt; now: number }) {
  const r80 = m.margin_range_80;
  const t80 = m.total_range_80;
  const span = (lo: number, hi: number) => `${marginWords(lo, hn, an)} to ${marginWords(hi, hn, an)}`;
  return (
    <div className="cproj">
      <div className="cproj__score" aria-label={`Projected score: ${an} ${fmt1(m.away_score)}, ${hn} ${fmt1(m.home_score)}`}>
        <div className="cproj__t"><span className="cproj__n">{an}</span><b className="num">{fmt1(m.away_score)}</b></div>
        <div className="cproj__t"><span className="cproj__n">{hn}</span><b className="num">{fmt1(m.home_score)}</b></div>
      </div>
      <div className="cproj__who">
        <RoleTag role={m.role} version={m.version} /> <AsOf iso={m.as_of} label="archived pre-tip" now={now} />
      </div>
      <dl className="cproj__grid">
        <KV k="Margin">{marginWords(m.margin, hn, an)}</KV>
        <KV k="Total"><span className="num">{fmt1(m.total)}</span></KV>
        <KV k="Possessions"><span className="num">{fmt1(m.possessions)}</span></KV>
        <KV k={`${hn} win probability`}><span className="num">{pct0(m.home_win_prob)}</span></KV>
      </dl>
      <p className="cproj__unc">
        <b>Model uncertainty.</b>{' '}
        {m.margin_sd != null ? <>Margin SD <span className="num">{fmt1(m.margin_sd)}</span>{r80 ? <>: 80% of the frozen model’s normal margin distribution lies between {span(r80[0], r80[1])}</> : null}. </> : null}
        {m.total_sd != null ? <>Total SD <span className="num">{fmt1(m.total_sd)}</span>{t80 ? <> (80%: <span className="num">{fmt1(t80[0])}–{fmt1(t80[1])}</span>)</> : null}.</> : null}
        {' '}These are the model’s own distribution, not guaranteed ranges.
        {c.neutral_site && ' Neutral site: no home-court edge in the model.'}
      </p>
      {c.integrity.identity_changed_versions.length > 0 && (
        <Notice tone="warn" title="This projection is for a different matchup than the current schedule">
          The schedule changed the teams or home/away after the projection was archived. It is shown for transparency and is not clean evidence.
        </Notice>
      )}
    </div>
  );
}

function NoProjection({ c }: { c: CbbResearchExt }) {
  const title = c.projection_state === 'UNAVAILABLE' ? 'No pre-tip projection' : c.projection_state === 'AWAITING_CAPTURE' ? 'Capture window open' : 'Projection pending';
  return (
    <Notice tone="research" title={title}>
      <p>{c.projection_message}</p>
      {c.projection_state === 'PENDING_WINDOW' && <p className="small muted">Projections are archived only within 30 hours of tip, by the frozen prospective pipeline. Nothing is projected early or after the fact.</p>}
    </Notice>
  );
}

function ResultLine({ c, hn, an }: { c: CbbResearchExt; hn: string; an: string }) {
  const res = c.result!;
  return (
    <div className="cres">
      <span className="eyebrow">Final</span>
      <span className="num cres__s">{an} {res.away_score} — {hn} {res.home_score}</span>
      <IntegrityBadge i={c.integrity} />
      {c.integrity.reasons.length > 0 && <span className="muted small">{c.integrity.reasons.join('; ')}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ rosters

function Rosters({ c, home, away, slug }: { c: CbbResearchExt; home: Participant; away: Participant; slug: string }) {
  if (c.roster.basis === 'none') return <p className="muted">{c.roster.basis_text}</p>;
  const sides: [Participant, 'away' | 'home'][] = [[away, 'away'], [home, 'home']];
  return (
    <>
      {c.proster && (
        <div className="cpro">
          <div className="eyebrow">P-ROSTER-1 · prospective roster overlay</div>
          <p className="small">
            Roster snapshot {stampTime(c.proster.truth_snapshot)?.slice(0, 16).replace('T', ' ')} UTC, archived with the projection.
            Overlay change to the margin vs its frozen base: <b className="num">{signed1(c.proster.adjustment_total)}</b>
            {' '}(input substitution <span className="num">{signed1(c.proster.adjustment_input_substitution)}</span>, continuity correction <span className="num">{signed1(c.proster.adjustment_continuity)}</span>).
          </p>
        </div>
      )}
      <div className="crost">
        {sides.map(([p, side]) => (
          <div key={side} className="panel crost__team">
            <div className="crost__h">
              <Link to={routes.team(slug, p.participant_id)} className="crost__name"><CbbMark p={p} size="sm" /> {teamShort(p)}</Link>
            </div>
            {c.proster ? <ProsterTeam s={c.proster.sides[side]} /> : <TruthTeam t={c.roster[side]} />}
          </div>
        ))}
      </div>
      <p className="muted small">Expected pregame rotation from roster and prior participation evidence — not a confirmed starting lineup, and not availability.</p>
    </>
  );
}

function ProsterTeam({ s }: { s: ProsterSide }) {
  return (
    <>
      <ConfidenceChip c={s.roster_confidence} long />
      <ul className="cflags">
        <li className={s.input_substitution_active ? 'on' : ''}>Input substitution {s.input_substitution_active ? 'active' : 'not applied'}</li>
        <li className={s.continuity_correction_active ? 'on' : ''}>Continuity correction {s.continuity_correction_active ? 'active' : 'not applied'}</li>
      </ul>
      <dl className="cproj__grid cproj__grid--sm">
        <KV k="Returning-minutes share">{pct0(s.returning_minutes_share)}</KV>
        <KV k="Expected (pre-roster)">{pct0(s.expected_returning_share)}</KV>
        <KV k="First-D-I players expected to play"><span className="num">{s.first_d1_expected_to_play ?? '—'}</span></KV>
      </dl>
      <Rotation players={s.expected_rotation} note={s.expected_rotation.length ? null : 'No valid expected rotation for this team (roster confidence or structural checks): the overlay leaves it at the frozen base.'} />
    </>
  );
}

function TruthTeam({ t }: { t: TeamRoster | null }) {
  if (!t?.available) return <p className="muted small">{t?.explanation ?? 'No roster-truth snapshot.'}</p>;
  return (
    <>
      <ConfidenceChip c={t.confidence} long />
      <p className="muted small">Snapshot {t.snapshot_at?.slice(0, 16).replace('T', ' ')} UTC{t.reason_text ? ` · ${t.reason_text}` : ''}</p>
      {t.continuity && (
        <dl className="cproj__grid cproj__grid--sm">
          <KV k="Returning-minutes share">{pct0(t.continuity.returning_minutes_share)}</KV>
          <KV k="First-D-I players expected to play"><span className="num">{t.continuity.first_d1_expected_to_play ?? '—'}</span></KV>
          <KV k="Game-1 continuity correction"><span className="num">{signed1(t.continuity.game1_continuity_correction)}</span></KV>
        </dl>
      )}
      <Rotation players={t.expected_rotation ?? []} note={t.rotation_valid ? null : `No expected rotation: ${t.rotation_note ?? 'not built'}.`} />
    </>
  );
}

export function Rotation({ players, note, max = 10 }: { players: RotationPlayer[]; note: string | null; max?: number }) {
  if (!players.length) return <p className="muted small">{note ?? 'No expected rotation published.'}</p>;
  const shown = players.slice(0, max);
  return (
    <table className="dtable crot">
      <caption>Expected rotation</caption>
      <thead><tr><th scope="col">Player</th><th scope="col" className="r">Exp. min</th><th scope="col">Status</th></tr></thead>
      <tbody>
        {shown.map((p) => (
          <tr key={p.player_id}>
            <th scope="row">{p.name ?? 'Unnamed listing'}{p.position ? <span className="muted"> · {p.position}</span> : null}{p.expected_starter ? <span className="crot__st" title="Expected starter"> S</span> : null}</th>
            <td className="r num">{fmt1(p.minutes)}</td>
            <td>{p.class_label}{p.prior_team ? <span className="muted small"> · from {p.prior_team}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ matchup

function Matchup({ r, c, an, hn, slug }: { r: EventResearchDoc; c: CbbResearchExt; an: string; hn: string; slug: string }) {
  const { metrics } = useSport();
  if (!r.matchup.length) {
    return <p className="muted">Opponent-adjusted ratings appear once the game has an archived pre-tip projection (they are stored in that record, never recomputed). {c.projection_state === 'PENDING_WINDOW' ? 'This game has not entered the capture window yet.' : ''}</p>;
  }
  const obs = new Map<string, { home: Observation | null; away: Observation | null }>();
  for (const m of r.matchup) obs.set(m.metric_id.replace(/^met_cbb\./, ''), { home: m.home, away: m.away });
  const homeId = r.event.home_participant!;
  const awayId = r.event.away_participant!;
  const cell = (o: Observation | null | undefined, team: string, opp: string) => {
    if (!o) return <span className="muted">—</span>;
    const def = metrics.get(o.metric_id);
    const unit = def?.unit === '%' ? '%' : '';
    return (
      <Link to={routes.metric(slug, o.metric_id, { team, opp, event: r.event.event_id })} className="cmu__v">
        <b className="num">{o.value?.toFixed(1)}{unit}</b>
        {o.context?.rank != null && <span className="cmu__rk num">#{o.context.rank}<span className="muted">/{o.context.universe_size}</span></span>}
      </Link>
    );
  };
  const block = (offName: string, defName: string, offSide: 'home' | 'away') => {
    const defSide = offSide === 'home' ? 'away' : 'home';
    const offId = offSide === 'home' ? homeId : awayId;
    const defId = offSide === 'home' ? awayId : homeId;
    return (
      <div className="cmu__block">
        <div className="cmu__bh">When <b>{offName}</b> has the ball</div>
        <div className="cmu__cols" aria-hidden="true"><span>{offName} offense</span><span /><span>{defName} defense</span></div>
        <ul className="cmu__rows">
          {c.matchup_pairs.map((p) => {
            const o = obs.get(p.offense)?.[offSide];
            const d = obs.get(p.defense)?.[defSide];
            if (!o && !d) return null;
            return (
              <li key={p.label} className="cmu__row">
                {cell(o, offId, defId)}
                <span className="cmu__l">{p.label}</span>
                {cell(d, defId, offId)}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <>
      <div className="cmu">
        {block(an, hn, 'away')}
        {block(hn, an, 'home')}
      </div>
      <p className="muted small">
        Pregame ratings from the {c.ratings_source?.version ?? 'incumbent'} record archived {c.ratings_source?.as_of?.slice(0, 16).replace('T', ' ')} UTC.
        Efficiency is points per 100 possessions; defensive values are what opponents do against the team (lower is better for defenses except turnover rate).
        A rank appears only when the national ranking holds this same value. No combined “edge” number is drawn.
      </p>
    </>
  );
}

// ------------------------------------------------------------------ model comparison

function ModelComparison({ c, hn, an }: { c: CbbResearchExt; hn: string; an: string }) {
  if (!c.models_detail.length) return <p className="muted">No model has an archived pre-tip projection for this game. {c.projection_message}</p>;
  return (
    <ul className="cmc" aria-label="Projections by model">
      <li className="cmc__head" aria-hidden="true"><span>Model</span><span>Score</span><span>Margin</span><span>Total</span><span>{hn} win</span></li>
      {c.models_detail.map((m) => (
        <li key={m.version} className={`cmc__row cmc__row--${m.role}`}>
          <span className="cmc__m"><RoleTag role={m.role} version={m.version} /></span>
          <span className="cmc__s num">{an} {fmt1(m.away_score)} – {hn} {fmt1(m.home_score)}</span>
          <span className="cmc__g num">{marginWords(m.margin, hn, an)}</span>
          <span className="cmc__t num">{fmt1(m.total)}</span>
          <span className="cmc__w num">{pct0(m.home_win_prob)}</span>
        </li>
      ))}
    </ul>
  );
}

function ResearchStatus({ c }: { c: CbbResearchExt }) {
  return (
    <div className="cstat">
      <p><IntegrityBadge i={c.integrity} /> <span className="muted">{c.integrity.text}</span></p>
      {c.integrity.reasons.length > 0 && <ul className="small">{c.integrity.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      {c.integrity.post_tip_records_ignored > 0 && <p className="small muted">{c.integrity.post_tip_records_ignored} archived record(s) made at or after tip are excluded: Sift never shows a projection created after tip.</p>}
      <p className="small muted">The models are compared only by the preregistered prospective protocol; no model is called better before it concludes.</p>
    </div>
  );
}

// ------------------------------------------------------------------ provenance

function Provenance({ r, c, now }: { r: EventResearchDoc; c: CbbResearchExt; now: number }) {
  return (
    <details className="gnotes cprov" id="cg-prov">
      <summary>Data &amp; provenance</summary>
      <dl className="cprov__kv">
        <KV k="Game">{c.cbb_game_id} · ESPN {c.espn_game_id}</KV>
        <KV k="Schedule source">{c.schedule.source === 'ESPN_FALLBACK' ? 'ESPN scoreboard (fallback: SportsDataverse did not list the game yet)' : 'SportsDataverse schedule (ESPN)'}{c.schedule.source_observed_at ? ` · observed ${c.schedule.source_observed_at.slice(0, 16).replace('T', ' ')} UTC` : ''}</KV>
        <KV k="Reconciled fields">{c.schedule.reconciled_fields.length ? c.schedule.reconciled_fields.join(', ') + ' (from ESPN’s latest observation of the same game)' : 'none'}</KV>
        <KV k="Listed tip">{c.schedule.listed_start} · {c.schedule.time_state}</KV>
        <KV k="Projection state">{c.projection_state}</KV>
        <KV k="Integrity">{c.integrity.status}{c.integrity.scoreboard ? ` · scoreboard ${c.integrity.scoreboard}` : ''}</KV>
        {c.proster && <KV k="Roster archive commit">{shortSha(c.proster.truth_archive_commit)} · snapshot {c.proster.truth_snapshot}</KV>}
      </dl>
      {c.models_detail.map((m) => (
        <div key={m.version} className="cprov__m">
          <div className="eyebrow">{m.role_label} · {m.version}</div>
          <dl className="cprov__kv">
            <KV k="As of"><AsOf iso={m.as_of} label="" now={now} /></KV>
            <KV k="Information cutoff">{m.info_cutoff ?? '—'}</KV>
            <KV k="Pre-tip basis">{m.pretip_basis.replace(/_/g, ' ')}</KV>
            <KV k="Code">{shortSha(m.provenance.code_sha)} (v{String(m.provenance.code_version ?? '—')})</KV>
            <KV k="Model artifact">{shortSha(m.provenance.model_sha256)}</KV>
            <KV k="Archive record">{String(m.provenance.archive_path ?? '—')} · sha {shortSha(m.provenance.record_sha256)}</KV>
            <KV k="Schedule at capture">{String(m.provenance.schedule_source ?? '—')} · window {String(m.provenance.schedule_window ?? '—')}</KV>
            {m.provenance.roster_archive_commit ? <KV k="Roster archive">{shortSha(m.provenance.roster_archive_commit)} · {String(m.provenance.truth_snapshot ?? '')}</KV> : null}
          </dl>
        </div>
      ))}
      {c.rejected_records.length > 0 && <p className="small muted">Excluded records: {c.rejected_records.map((x) => `${x.version} ${x.as_of ?? ''} (${x.reason.replace(/_/g, ' ')})`).join('; ')}.</p>}
      <p className="small muted"><QualityBadge quality={r.quality} /> {r.quality.source} · generated {r.quality.generated_at} · {r.quality.limitations.join(' · ')}</p>
      <p className="small muted">Roster confidence: {Object.entries(CONFIDENCE_TEXT).map(([k, v]) => `${k} — ${v}`).join(' ')}</p>
    </details>
  );
}
