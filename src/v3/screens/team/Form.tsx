// TR3: what has actually been happening. The last games as margin bars, the last half against the half before it, home, away and
// one-score splits computed from the game rows, the locked row for what needs closing lines, and the season's results.
import { useMemo } from 'react';
import { NavRow, TeamLink } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { Icon } from '../../ui/Icon';
import { LockedRow } from '../../ui/atoms';
import { TeamLogo } from '../../ui/TeamLogo';
import { completedGames, halves, lastN, oneDecimal, recordText, seasonSpan, signedOne, splitsOf, type GameRowVM, type SplitVM } from '../../model/teamResearch';
import { RecentMargins } from './Overview';
import { Eyebrow, Skel, shortDate, type ReadyCtx, type TeamPageCtx } from './parts';

const SHOWN = 6;

function ResultRow({ c, g }: { c: ReadyCtx; g: GameRowVM }) {
  const opp = c.identity(g.oppCode ?? g.oppId ?? '—', g.oppName);
  const wl = g.outcome === 'W' ? 'W' : g.outcome === 'T' ? 'T' : 'L';
  const word = wl === 'W' ? 'Win' : wl === 'T' ? 'Tie' : 'Loss';
  const where = `${g.home === false ? 'at' : 'vs'} ${g.oppCode ?? g.oppName}`;
  return (
    <NavRow to={routes.game({ slug: c.slug, eventId: g.eventId })} kind="game" label={`${word} ${g.for} to ${g.against} ${where}. Open game`} className="res">
      <span className="wk">{g.week ?? shortDate(g.startUtc)}</span>
      {g.oppCode ? <TeamLink team={{ slug: c.slug, id: g.oppCode }} label={`${opp.name}, team page`}><TeamLogo team={opp} size={24} /></TeamLink> : <TeamLogo team={opp} size={24} />}
      <span className="nm">{g.home === false ? '@ ' : 'vs '}{g.oppCode ?? g.oppName}</span>
      <b className="num">{g.for}–{g.against}</b>
      <span className={`wl ${wl}`} aria-hidden="true">{wl}</span>
    </NavRow>
  );
}

const Cell = ({ label, s }: { label: string; s: SplitVM }) => (
  <div><small>{label}</small><b className="num">{s.n ? recordText(s) : '—'}</b><span>{s.n ? `${signedOne(s.avgMargin)} avg margin` : 'no games'}</span></div>
);

export function Form({ c }: { c: TeamPageCtx }) {
  const ready = c.profile ? (c as ReadyCtx) : null;
  const all = useMemo(() => (c.profile ? completedGames(c.slug, c.profile, c.codeOf) : []), [c.slug, c.profile, c.codeOf]);
  if (!ready) return <div className="tm-body"><Skel h={262} label="Loading results" /><Skel h={120} /><Skel h={64} /><Skel h={260} /></div>;
  const fd = c.decl.form;
  const n = Math.min(fd.form, all.length);
  const recent = lastN(all, fd.form);
  const h = halves(recent);
  const sp = splitsOf(recent, fd.oneScore.margin);
  const span = seasonSpan(recent);
  const season = ready.profile.season;
  const results = all.filter((g) => g.season === season).reverse();
  const shown = c.state.all ? results : results.slice(0, SHOWN);
  if (!all.length) return <div className="tm-body"><LockedRow title="Results">No completed games are published for this team yet.</LockedRow></div>;
  return (
    <div className="tm-body">
      <section className="tm-card tm-frm" aria-label={`Last ${n} games`}>
        <div className="exh"><Eyebrow>Last {n} games · margin</Eyebrow>{span && <span className="div26">{span}</span>}</div>
        <RecentMargins c={ready} n={fd.form} height={118} id={`fm${c.code}`} />
        {h.last && h.prev && (
          <div className="twov">
            <div><small>Last {h.last.n}</small><b className="num">{oneDecimal(h.last.scored)}<i>/</i>{oneDecimal(h.last.allowed)}</b><span>scored / allowed</span></div>
            <div><small>Previous {h.prev.n}</small><b className="num">{oneDecimal(h.prev.scored)}<i>/</i>{oneDecimal(h.prev.allowed)}</b><span>scored / allowed</span></div>
          </div>
        )}
      </section>
      <section className="tm-card tm-spl3" aria-label={`Splits, last ${n}`}>
        <div className="exh"><Eyebrow>Splits · last {n}</Eyebrow></div>
        <div className="s3"><Cell label="Home" s={sp.home} /><Cell label="Away" s={sp.away} /><Cell label={fd.oneScore.label} s={sp.one} /></div>
        {fd.otNote && ready.profile.record && <p className="tm-note">Losses include overtime and shootout losses: the record keeps them apart ({ready.profile.record.text}), the game rows do not say which.</p>}
      </section>
      <div className="tm-lockc" role="note">
        <Icon name="lock" size={15} />
        <div><b>Against the spread · over/under record</b><span>Needs closing lines by game, which SIFT does not publish.</span></div>
      </div>
      <div className="tm-lockc" role="note">
        <Icon name="lock" size={15} />
        <div><b>Home and away statistics</b><span>The publication stores game results by site, not statistics by site, so the splits above are results only.</span></div>
      </div>
      <div className="exh exh--pad"><Eyebrow>{season ? `${season.replace('-', '–')} results` : 'Results'}</Eyebrow></div>
      <section className="tm-card tm-reslist" aria-label="Results">
        {shown.map((g) => <ResultRow key={g.eventId} c={ready} g={g} />)}
        {!shown.length && <p className="tm-note tm-note--pad">No completed games this season.</p>}
      </section>
      {results.length > SHOWN && (
        <button type="button" className="showall" aria-expanded={c.state.all} onClick={() => c.set({ all: !c.state.all })}>
          {c.state.all ? 'Show fewer results' : `Show all ${results.length} results`} <Icon name={c.state.all ? 'chevU' : 'chevR'} size={14} />
        </button>
      )}
    </div>
  );
}
