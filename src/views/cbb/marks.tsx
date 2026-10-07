// CBB ranking-row identity (school logo + conference), loaded lazily by the generic ranking screen.
import type { RankingEntry } from '../../contract/types';
import { confShort, identity } from './identity';
import { TeamLogo } from './viz';

export const markFor = (e: RankingEntry) => <TeamLogo pid={e.entity_id} abbr={e.short_name} size={20} className="rankbars__logo" />;
export const subFor = (e: RankingEntry) => confShort(identity(e.entity_id)?.conference);
