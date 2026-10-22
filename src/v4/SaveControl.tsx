// Save to the research tray: the same store, item shape and rules as the app's SaveButton (state/tray.tsx), so what is
// saved here is on My Board in every interface. After kickoff nothing new can be saved as pregame research; an item
// saved earlier stays saved and can be removed. No account, no new storage.
import { useId, useState } from 'react';
import { Icon } from './Icon';
import { useNow } from '../live/hooks';
import { FROZEN_LABEL, FROZEN_WHY, isFrozen } from '../lib/lifecycle';
import { makeTrayItem, type RefKind, type TrayExtra } from '../packet/tray';
import { useTray, type TrayLabel } from '../state/tray';

export interface SaveProps {
  ref_kind?: RefKind;
  sport: string;
  id: string;
  extra?: Partial<TrayExtra> | null;
  label: TrayLabel;
  /** The game's scheduled kickoff: once passed, nothing new is saved. */
  kickoff?: string | null;
  eventStatus?: string | null;
  /** 'icon' is the round header control; 'button' is a labelled button. */
  variant?: 'icon' | 'button';
}

export function SaveControl({ ref_kind = 'MARKET', sport, id, extra, label, kickoff, eventStatus, variant = 'button' }: SaveProps) {
  const tray = useTray();
  const now = useNow(30_000);
  const noteId = useId();
  const [explain, setExplain] = useState(false);
  const [said, setSaid] = useState('');
  const saved = tray.has(ref_kind, id, extra);
  const itemId = makeTrayItem({ ref_kind, sport, id, extra, added_at: new Date(0) }).item_id;
  const frozen = (kickoff != null || eventStatus != null) && isFrozen(kickoff, now, eventStatus);
  const what = label.label;
  const cls = variant === 'icon' ? 'v4-gbtn' : 'v4-btn v4-btn--sec';

  if (frozen && !saved) {
    return (
      <span className="v4-save">
        <button type="button" className={`${cls} v4-save--frozen`} aria-disabled="true" aria-describedby={noteId} aria-label={`${FROZEN_LABEL}: ${what} cannot be saved after kickoff`} title={FROZEN_WHY} onClick={() => setExplain((x) => !x)}>
          <Icon name="lock-simple" />{variant === 'button' && <span>Frozen</span>}
        </button>
        <span id={noteId} className={explain ? 'v4-save__why' : 'sr'} role={explain ? 'status' : undefined}>{FROZEN_WHY}</span>
      </span>
    );
  }
  return (
    <span className="v4-save">
      <button type="button" className={`${cls}${saved ? ' v4-gbtn--on' : ''}`} aria-pressed={saved} aria-label={`${saved ? 'Remove from' : 'Save to'} My Board: ${what}`}
        onClick={() => {
          if (saved) { tray.remove(itemId); setSaid(`Removed ${what} from My Board`); return; }
          const added = tray.add({ ref_kind, sport, id, extra, label, kickoff, eventStatus });
          setSaid(added ? `Saved ${what} to My Board` : `${FROZEN_LABEL}: not saved`);
        }}>
        <Icon name="bookmark-simple" filled={saved} />{variant === 'button' && <span>{saved ? 'Saved' : 'Save'}</span>}
      </button>
      <span className="sr" role="status" aria-live="polite">{said}</span>
    </span>
  );
}
