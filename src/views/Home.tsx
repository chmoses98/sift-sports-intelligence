import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAsync, useRepo } from '../data/hooks';
import { explorable, sportByCode } from '../data/sports';
import { Icon, SiftMark } from '../components/Icon';
import { HealthPill } from '../components/SourceBanner';
import { FreshnessChip, Skeleton, TeamMark } from '../components/ui';
import { publicationView, QuoteChip } from '../components/LiveQuote';
import { compact, dayLabel, timeLabel, until } from '../lib/format';
import { routes } from '../lib/routes';
import { useAllSports } from '../state/allSports';
import { useTrail, useVisit } from '../state/trail';
import { useTray } from '../state/tray';

function NflNow() {
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const board = useAsync(repo.data ? `board:NFL:${repo.data.source.root}` : null, () => repo.data!.board());
  if (repo.loading || board.loading) return <Skeleton lines={4} tall />;
  if (!board.data) return <p className="muted">The NFL board could not be read.</p>;
  const now = Date.now();
  const up = board.data.items.filter((i) => i.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
  const comp = up[0]?.competition ?? '';
  const markets = up.reduce((a, b) => a + b.markets_available, 0);
  const next = up.slice(0, 6);
  return (
    <div className="now">
      <div className="now__head">
        <div>
          <div className="eyebrow eyebrow--signal">Now · NFL</div>
          <div className="now__title">{comp}</div>
          <div className="now__stats">
            <span><b className="num">{up.length}</b> games</span>
            <span><b className="num">{compact(markets)}</b> markets</span>
            <QuoteChip view={publicationView(up.map((u) => u.market_captured_at).filter(Boolean).sort().pop() ?? null)} now={now} label="published prices" />
          </div>
        </div>
        <Link to={routes.sport('nfl')} className="btn btn--primary">Open the slate <Icon name="arrowRight" size={16} /></Link>
      </div>
      <ul className="now__games">
        {next.map((g) => {
          const a = g.participants.find((p) => p.participant_id === g.away_participant);
          const h = g.participants.find((p) => p.participant_id === g.home_participant);
          return (
            <li key={g.event_id}>
              <Link to={routes.game('nfl', g.event_id)} className="mini">
                <span className="mini__t"><TeamMark sport="NFL" abbr={a?.short_name} size="sm" /> {a?.short_name} <span className="muted">@</span> <TeamMark sport="NFL" abbr={h?.short_name} size="sm" /> {h?.short_name}</span>
                <span className="mini__w">{dayLabel(g.start_time_utc).split(',')[0]} {timeLabel(g.start_time_utc)} · {Date.parse(g.start_time_utc) > now ? until(g.start_time_utc, now) : 'kickoff passed'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sports() {
  const all = useAllSports();
  if (all.loading) return <Skeleton lines={7} />;
  return (
    <ul className="sportgrid">
      {(all.data ?? []).map((s) => {
        const h = s.source?.liveHealth;
        const inSift = explorable(s.sport);
        return (
          <li key={s.sport.code}>
            <Link to={routes.sport(s.sport.slug)} className={`sportcard${inSift ? ' sportcard--in' : ''}`}>
              <div className="sportcard__h">
                <span className="sportcard__name">{s.sport.label}</span>
                {s.sport.tier === 'primary' && <span className="tag tag--signal">primary</span>}
                {s.sport.tier === 'secondary' && <span className="tag">beta</span>}
              </div>
              <div className="sportcard__health">
                <HealthPill status={h?.overall_status} />
                {h && <FreshnessChip asOf={h.last_market_capture} component="market_data" thresholds={h.thresholds?.market_data} />}
              </div>
              <div className="capbar" aria-label={`Capabilities: ${Object.entries(s.counts).map(([k, v]) => `${v} ${k}`).join(', ')}`}>
                {(['VERIFIED', 'PARTIAL', 'RESEARCH', 'UNAVAILABLE'] as const).map((k) => (
                  <span key={k} className={`capbar__seg capbar__seg--${k.toLowerCase()}`} style={{ flexGrow: s.counts[k] ?? 0 }} title={`${s.counts[k] ?? 0} ${k}`} />
                ))}
              </div>
              <div className="sportcard__foot">
                {s.caps ? `${s.counts.VERIFIED ?? 0} verified · ${s.counts.PARTIAL ?? 0} partial · ${s.counts.RESEARCH ?? 0} research of ${s.caps.items.length}` : 'no capability manifest'}
                <span className="sportcard__mode">{inSift ? (s.source?.mode === 'snapshot' ? 'research snapshot' : 'explore') : 'health only'}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HomeView() {
  useVisit('Home', 'home');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const tray = useTray();
  const { steps } = useTrail();
  const recent = steps.filter((s) => s.kind !== 'home').slice(-5).reverse();
  return (
    <div className="page home">
      <section className="hero">
        <div className="hero__strata" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="hero__in">
          <div className="hero__mark"><SiftMark size={44} /></div>
          <h1 className="hero__word">Sift</h1>
          <p className="hero__tag">Sports intelligence. Separate the signal from the noise — then follow it.</p>
          <form role="search" className="bigsearch bigsearch--hero" onSubmit={(e) => { e.preventDefault(); nav(routes.search(q)); }}>
            <Icon name="search" size={20} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bills · Josh Allen · Baltimore pass defense · passing yards" aria-label="Search Sift" />
            <button type="submit" className="btn btn--primary btn--sm">Search</button>
          </form>
          <p className="hero__fine">Every number is published research from the Edge Finder pipeline. Projections and model prices are evidence, not bets.</p>
        </div>
      </section>

      <div className="homegrid">
        <section className="homegrid__main" aria-label="What is happening">
          <NflNow />
        </section>
        <aside className="homegrid__side">
          <div className="panel">
            <div className="eyebrow">Research tray</div>
            <div className="panel__big num">{tray.tray.items.length}</div>
            <p className="muted small">{tray.tray.items.length ? 'saved references on this device' : 'Save anything with + Tray as you explore.'}</p>
            <div className="cta-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => tray.setOpen(true)}>Open tray</button>
              {tray.tray.items.length > 0 && <Link className="btn btn--primary btn--sm" to={routes.packet({ sport: 'nfl', scope: 'CUSTOM' })}><Icon name="bolt" size={14} /> Build packet</Link>}
            </div>
          </div>
          {recent.length > 0 && (
            <div className="panel">
              <div className="eyebrow">Pick up where you left off</div>
              <ol className="recent">
                {recent.map((s) => <li key={s.href}><Link to={s.href}>{s.label}</Link></li>)}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <section className="stratum" aria-labelledby="sports-h">
        <header className="stratum__head">
          <span className="stratum__n" aria-hidden="true">∷</span>
          <div className="stratum__titles">
            <h2 className="stratum__title" id="sports-h">Sports & research support</h2>
            <p className="stratum__sub">Live health from each sport's own publication. The bar is its capability manifest: <span className="qkey qkey--verified">verified</span> <span className="qkey qkey--partial">partial</span> <span className="qkey qkey--research">research</span> <span className="qkey qkey--unavailable">unavailable</span>.</p>
          </div>
        </header>
        <Sports />
      </section>

      <section className="principles" aria-label="How to read Sift">
        <div><b>Evidence, not picks.</b> Model prices and projections are research outputs. Sift never ranks “best bets”.</div>
        <div><b>Every number has context.</b> Rank of how many, against whom, over what window, how trustworthy.</div>
        <div><b>Weak data says so.</b> Capabilities a sport cannot support are hidden or labelled, never faked.</div>
        <div><b>$0 infrastructure.</b> Static files on GitHub, read directly by your browser.</div>
      </section>
    </div>
  );
}
