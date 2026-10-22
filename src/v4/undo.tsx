// Single-item Undo for My Board. Removing a saved item keeps exactly what was stored (the tray item, its label with side, saved time and
// price snapshot, and its position) for as long as the viewer stays on the Board, and Undo puts that back verbatim through the tray's
// own `restore`: nothing is re-created, so no id or timestamp changes. Only the last removal is undoable; removing another item, leaving
// the Board or dismissing the bar ends it. "Clear Board" is a separate, confirmed action and has no Undo.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from '../routing';
import { useTray, type RemovedEntry } from '../state/tray';
import { Icon } from './Icon';

interface UndoApi {
  /** Remove a saved item and offer to take it back. */
  removeItem: (itemId: string) => void;
  /** The item_id Undo just put back (the row focuses itself once), or null. */
  restoredId: string | null;
}

const Ctx = createContext<UndoApi>({ removeItem: () => {}, restoredId: null });
export const useBoardUndo = () => useContext(Ctx);

const BOARD_PATH = '/v4/board';

export function UndoProvider({ children }: { children: ReactNode }) {
  const tray = useTray();
  const { pathname } = useLocation();
  const [removed, setRemoved] = useState<RemovedEntry | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [seen, setSeen] = useState(pathname);
  const undoBtn = useRef<HTMLButtonElement>(null);

  // Leaving the Board ends the offer (state adjusted during render, not in an effect).
  if (seen !== pathname) {
    setSeen(pathname);
    if (pathname !== BOARD_PATH) { setRemoved(null); setRestoredId(null); setSaid(''); }
  }

  const removeItem = useCallback((itemId: string) => {
    const index = tray.tray.items.findIndex((i) => i.item_id === itemId);
    if (index < 0) return;
    const item = tray.tray.items[index];
    setRemoved({ item, label: tray.labels[itemId], index });
    setRestoredId(null);
    setSaid(`Removed ${tray.labels[itemId]?.label ?? item.id} from My Board. Undo is available.`);
    tray.remove(itemId);
  }, [tray]);

  const undo = useCallback(() => {
    if (!removed) return;
    const name = removed.label?.label ?? removed.item.id;
    if (tray.tray.items.some((i) => i.item_id === removed.item.item_id)) {
      setSaid(`${name} is already saved again; nothing was changed.`);
    } else {
      tray.restore(removed);
      setSaid(`Restored ${name} to My Board.`);
    }
    setRestoredId(removed.item.item_id);
    setRemoved(null);
  }, [removed, tray]);

  // The row that was removed no longer exists, so keyboard and screen-reader focus would fall to the page: put it on Undo.
  useEffect(() => { if (removed) undoBtn.current?.focus(); }, [removed]);

  const api = useMemo<UndoApi>(() => ({ removeItem, restoredId }), [removeItem, restoredId]);
  const name = removed ? removed.label?.label ?? removed.item.id : '';
  return (
    <Ctx.Provider value={api}>
      {children}
      <p className="sr" role="status" aria-live="polite" data-v4-undo-status>{said}</p>
      {removed && (
        <div className="v4-undo" role="group" aria-label="Undo remove">
          <span className="v4-undo__t"><Icon name="trash" size="s" /><span>Removed <b>{name}</b></span></span>
          <button ref={undoBtn} type="button" className="v4-undo__go" aria-label={`Undo: put ${name} back on My Board`} onClick={undo}>Undo</button>
          <button type="button" className="v4-undo__x" aria-label="Dismiss" onClick={() => { setRemoved(null); setSaid(''); }}><Icon name="x" size="s" /></button>
        </div>
      )}
    </Ctx.Provider>
  );
}
