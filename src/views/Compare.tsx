import { scaleLinear } from 'd3-scale';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useWidth } from '../charts/useWidth';
import type { EntityProfileDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { EntityLink, Notice, QualityBadge, Skeleton, Stratum, TeamMark } from '../components/ui';
import { kickoff, metricFormatter, pct } from '../lib/format';
import { routes } from '../lib/routes';
import { useDirectory } from '../state/directory';
import { useSport } from '../state/sport';
import { useVisit } from '../state/trail';
import { quantilesOf } from './Player';

function PairRange({ label, a, b, fmt }: { label: string; a: ReturnType<typeof quantilesOf>; b: ReturnType<typeof quantilesOf>; fmt: (v: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vals = [a, b].flatMap((q) => (q ? [q.p05, q.p95, q.mean ?? q.p50] : [])).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const x = scaleLinear().domain([Math.min(...vals), Math.max(...vals) || 1]).nice().range([12, width - 12]);
  const row = (q: ReturnType<typeof quantilesOf>, y: number, cls: string) =>
    q ? (
      <g className={cls}>
        <line x1={x(q.p05!)} x2={x(q.p95!)} y1={y} y2={y} className="dist__whisker" />
        <rect x={x(q.p25!)} y={y - 6} width={Math.max(2, x(q.p75!) - x(q.p25!))} height={12} rx={3} className="dist__box" />
        {q.mean != null && <circle cx={x(q.mean)} cy={y} r={4} className="dist__mean" />}
      </g>
    ) : null;
  return (
    <div className="pairrange" ref={ref}>
      <div className="pairrange__h">
        <span>{label}</span>
        <span className="num"><span className="dotkey dotkey--a" /> {a?.mean != null ? fmt(a.mean) : '—'} · <span className="dotkey dotkey--b" /> {b?.mean != null ? fmt(b.mean) : '—'}</span>
      </div>
      <svg width={width} height={58} role="img" aria-label={`${label}: mean ${a?.mean} vs ${b?.mean}`}>
        {row(a, 14, 'pr--a')}
        {row(b, 36, 'pr--b')}
        {x.ticks(4).map((t) => (
          <text key={t} x={x(t)} y={56} className="ax-tick" textAnchor="middle">{fmt(t)}</text>
        ))}
      </svg>
    </div>
  );
}

export function CompareView() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const a = sp.get('a');
  const b = sp.get('b');
  const { sport, repo, slug, metrics } = useSport();
  const dir = useDirectory(repo);
  const pa = useAsync(a ? `prof:${sport.code}:${a}` : null, () => repo.profile(a!));
  const pb = useAsync(b ? `prof:${sport.code}:${b}` : null, () => repo.profile(b!));
  useVisit(pa.data && pb.data ? `${pa.data.entity.display_name} vs ${pb.data.entity.display_name}` : null, 'compare');
  if (!a) return <div className="page"><Notice title="Pick a player to compare from their profile." /></div>;
  if (pa.loading || pb.loading) return <div className="page"><Skeleton lines={8} tall /></div>;
  const A = pa.data;
  const B = pb.data;
  const pos = (A?.entity.metadata?.position as string) ?? '';
  const options = dir.data ? Object.values(dir.data.index.players_by_team).flat().filter((id) => id !== a && dir.data!.player(id)?.context?.position === pos) : [];
  const head = (p: EntityProfileDoc | undefined, cls: string) =>
    p ? (
      <div className={`cmp__who ${cls}`}>
        <TeamMark sport={sport.code} abbr={p.team?.short_name} />
        <div>
          <Link to={routes.player(slug, p.entity.participant_id)} className="cmp__name">{p.entity.display_name}</Link>
          <div className="muted small">{p.entity.metadata?.position as string} · {p.team?.display_name}{p.games[0] ? ` · ${p.games[0].home_away === 'AWAY' ? '@' : 'vs'} ${p.games[0].opponent_name} ${kickoff(p.games[0].start_time_utc)}` : ''}</div>
        </div>
      </div>
    ) : null;
  const sims = [...new Set([...(A?.metrics ?? []), ...(B?.metrics ?? [])].filter((o) => quantilesOf(o)).map((o) => o.metric_id))];
  const shares = [...new Set([...(A?.metrics ?? []), ...(B?.metrics ?? [])].filter((o) => o.metric_id.startsWith('met_nfl.proj_')).map((o) => o.metric_id))];
  return (
    <div className="page compare">
      <header className="ehead ehead--metric">
        <div className="ehead__t">
          <div className="eyebrow"><EntityLink to={routes.sport(slug)} kind="sport" quiet>{sport.label}</EntityLink> · Compare players</div>
          <div className="cmp__heads">
            {head(A, 'cmp__who--a')}
            <span className="cmp__vs">vs</span>
            {B ? head(B, 'cmp__who--b') : <span className="muted">choose a second player</span>}
          </div>
          <label className="cmp__pick">
            <span>Compare with</span>
            <select value={b ?? ''} onChange={(e) => nav(routes.compare(slug, a, e.target.value), { replace: true })}>
              <option value="">—</option>
              {options.map((id) => (
                <option key={id} value={id}>{dir.data?.player(id)?.label} ({dir.data?.player(id)?.context?.team})</option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {A && B && (
        <>
          <Stratum n="01" title="Projected distributions, same axis" sub="Each player's simulated range for the same stat in their own game this week. RESEARCH.">
            {sims.map((mid) => (
              <PairRange key={mid} label={metrics.get(mid)?.name.replace('Simulated ', '') ?? mid}
                a={quantilesOf(A.metrics.find((o) => o.metric_id === mid))} b={quantilesOf(B.metrics.find((o) => o.metric_id === mid))}
                fmt={(v) => metricFormatter(metrics.get(mid))(v)} />
            ))}
            {!sims.length && <p className="muted">Neither player has a simulated distribution in this publication.</p>}
          </Stratum>
          <Stratum n="02" title="Usage & availability">
            <table className="dtable">
              <thead><tr><th /><th scope="col">{A.entity.display_name}</th><th scope="col">{B.entity.display_name}</th></tr></thead>
              <tbody>
                {shares.map((mid) => (
                  <tr key={mid}><th scope="row">{metrics.get(mid)?.name}</th>
                    <td className="num">{pct(A.metrics.find((o) => o.metric_id === mid)?.value, 1)}</td>
                    <td className="num">{pct(B.metrics.find((o) => o.metric_id === mid)?.value, 1)}</td></tr>
                ))}
                <tr><th scope="row">P(active)</th><td className="num">{pct((A.extensions as Record<string, number>)?.p_active, 1)}</td><td className="num">{pct((B.extensions as Record<string, number>)?.p_active, 1)}</td></tr>
                <tr><th scope="row">Markets</th><td className="num">{A.markets.length}</td><td className="num">{B.markets.length}</td></tr>
                <tr><th scope="row">Availability</th><td>{A.availability[0]?.status ?? '—'}</td><td>{B.availability[0]?.status ?? '—'}</td></tr>
                <tr><th scope="row">Quality</th><td><QualityBadge quality={A.quality} /></td><td><QualityBadge quality={B.quality} /></td></tr>
              </tbody>
            </table>
          </Stratum>
        </>
      )}
    </div>
  );
}
