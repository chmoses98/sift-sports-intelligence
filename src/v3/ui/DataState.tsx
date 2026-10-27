// The one honest state for data a screen could not show. It says WHAT is unavailable and WHY, offers Retry only where asking again can help,
// and never stands in for the data (no sample, no old copy, no zero). The rest of the screen keeps working around it.
//   <DataState title="Rankings unavailable" err={error} retry={retry}>The ranking behind this statistic</DataState>
//   -> "Rankings unavailable" / "The ranking behind this statistic could not be shown: the connection to it failed." / [Retry]
// `empty` is the other honest state: the document loaded and lists nothing ("No props are listed for this game").
import type { ReactNode } from 'react';
import { canRetry, whyUnavailable } from '../data/failure';
import { Icon } from './Icon';

interface Common { title: string; children?: ReactNode; className?: string }
interface Failed extends Common { err: unknown; retry?: () => void; /** Say it with the urgency of an alert (the screen's primary data). */ alert?: boolean }
interface Empty extends Common { err?: undefined; retry?: undefined; alert?: undefined }

export function DataState(p: Failed | Empty) {
  const failed = p.err !== undefined;
  const can = failed && !!p.retry && canRetry(p.err);
  return (
    <div className={`v3-state${failed ? ' v3-state--warn' : ''}${p.className ? ` ${p.className}` : ''}`} role={failed && p.alert ? 'alert' : 'status'} data-state={failed ? 'unavailable' : 'empty'}>
      <Icon name={failed ? 'wifiOff' : 'info'} size={20} />
      <div>
        <b>{p.title}</b>
        {p.children}{failed && <> could not be shown: {whyUnavailable(p.err)}.</>}
        {can && <><br /><button type="button" onClick={p.retry}>Retry</button></>}
      </div>
    </div>
  );
}
