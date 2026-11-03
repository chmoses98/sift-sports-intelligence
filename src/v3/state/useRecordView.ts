// Record that the viewer opened a page, for My SIFT's Recent list. Call it with the page's visit once its title is known (null until then);
// it records once per page, not on every render.
import { useEffect } from 'react';
import { pushVisit } from './prefs';
import { visitKey, type Visit } from '../model/workspace';

export function useRecordView(v: Visit | null): void {
  const key = v ? visitKey(v) : null;
  const title = v?.title ?? null;
  useEffect(() => { if (v) pushVisit(v); }, [key, title]); // eslint-disable-line react-hooks/exhaustive-deps -- a page is recorded when it (or its title) changes, not when the object is rebuilt
}
