// The CBB module on Sift's global Home: one line of research status with the way in. Quiet when the CBB
// publication cannot be read (the Home never shows a broken CBB block).
import { Link } from 'react-router';
import { useAsync, useRepo } from '../../data/hooks';
import { sportByCode } from '../../data/sports';
import { SportMark } from '../../components/SportMark';
import { Icon } from '../../components/Icon';
import { routes } from '../../lib/routes';
import { statusExt } from './data';

export function CbbHomeModule() {
  const cbb = sportByCode('CBB')!;
  const repo = useRepo(cbb);
  const health = useAsync(repo.data?.source.root ? `health:CBB:${repo.data.source.root}` : null, () => repo.data!.health());
  const st = statusExt(health.data);
  if (!st) return null;
  const pre = st.research_status === 'PRESEASON';
  const projected = st.projection_states.PROJECTED ?? 0;
  const first = st.first_game_utc ? new Date(st.first_game_utc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  return (
    <section className="panel cbbmod" aria-labelledby="cbbmod-h">
      <Link to={routes.sport('cbb')} className="cbbmod__a">
        <SportMark slug="cbb" icon="basketball" size={26} />
        <span className="cbbmod__t">
          <span className="eyebrow">College basketball · {st.season}</span>
          <b id="cbbmod-h">{pre ? `Preseason${first ? ` · first game ${first}` : ''}` : `${projected} games with a pre-tip projection`}</b>
          <span className="muted small">{st.schedule.d1_games.toLocaleString()} D-I games · prospective sample N = {st.prospective.game_1.N} · research only</span>
        </span>
        <Icon name="arrowRight" size={16} />
      </Link>
    </section>
  );
}
