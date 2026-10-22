// A saved market remembers WHICH SIDE the viewer selected. The tray item id is a hash of the market and its extra, so
// the two sides of one Kalshi market need distinct extras to be two distinct saves. YES keeps the identity every
// earlier save of that market already has (SIFT 2.0's Save button, earlier v4 saves): nothing saved before is orphaned
// or duplicated, and a save without a side has always meant YES. NO adds a side key to `x`, which MARKET items do not
// otherwise use. The label also records the side so My Board states and tracks the same outcome the viewer chose.
import type { TrayExtra } from '../packet/tray';
import type { Side } from '../opportunity/types';

export const sideExtra = (marketId: string, eventId: string, side: Side): Partial<TrayExtra> => ({ market_id: marketId, event_id: eventId, ...(side === 'NO' ? { x: 'side=NO' } : {}) });

/** The words for the side a save is on, for its sub-line and announcements. */
export const sideWord = (side: Side) => (side === 'NO' ? 'under (No)' : 'over (Yes)');
