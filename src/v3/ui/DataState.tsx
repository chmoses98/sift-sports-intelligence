// The one honest state for data a screen could not show. It says WHAT is unavailable and WHY, offers Retry only where asking again can help,
// and never stands in for the data (no sample, no old copy, no zero). The rest of the screen keeps working around it.
//   <DataState title="Rankings unavailable" err={error} retry={retry}>The ranking behind this statistic</DataState>
//   -> "Rankings unavailable" / "The ranking behind this statistic could not be shown: the connection to it failed." / [Retry]
// `err` is the error a document read threw (data/failure.ts words it); `why` states the cause directly when no single error exists (several
// documents failed). With neither, it is the other honest state: the document loaded and lists nothing ("No props are listed for this game").
import type { ReactNode } from 'react';
import { canRetry, whyUnavailable } from '../data/failure';
import { Icon } from './Icon';

interface Props {
  title: string;
  children?: ReactNode;
  className?: string;
  err?: unknown;
  why?: string;
  retry?: () => void;
  /** Say it with the urgency of an alert (the screen's primary data). */
  alert?: boolean;
}

export function DataState({ title, children, className, err, why, retry, alert }: Props) {
  const failed = err !== undefined || why !== undefined;
  const can = failed && !!retry && (why !== undefined || canRetry(err));
  return (
    <div className={`v3-state${failed ? ' v3-state--warn' : ''}${className ? ` ${className}` : ''}`} role={failed && alert ? 'alert' : 'status'} data-state={failed ? 'unavailable' : 'empty'}>
      <Icon name={failed ? 'wifiOff' : 'info'} size={20} />
      <div>
        <b>{title}</b>
        {children}{failed && <> could not be shown: {why ?? whyUnavailable(err)}.</>}
        {can && <><br /><button type="button" onClick={retry}>Retry</button></>}
      </div>
    </div>
  );
}
