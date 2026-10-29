// A seam between the sheet host and the URL-state hook. A sheet is its own history entry (so Back closes it). A state change made
// from inside a sheet (choose a line, apply filters, pick a stat) must land on the screen underneath, not on the sheet's entry,
// which Back discards. The hook therefore asks the host to close the sheet and runs the change once the screen is current again.
type Close = () => void;
let closer: Close | null = null;
let deferred: (() => void)[] = [];

export const sheetBridge = {
  register(c: Close | null) { closer = c; },
  /** Run `fn` after the open sheet has closed. Returns false (and runs nothing) when no sheet entry is open. */
  afterClose(fn: () => void): boolean {
    if (!closer) return false;
    deferred.push(fn);
    closer();
    return true;
  },
  flush() { const d = deferred; deferred = []; d.forEach((fn) => fn()); },
  /** A sheet that was dismissed without applying anything must not leave work behind for the next one. */
  clear() { deferred = []; },
};
