import {useState, type ReactNode} from 'react';

/** Mount expensive research only when requested; preserve its state after first use.
 * Native toggle also handles PlayerSnapshot's programmatic disclosure control. */
export function ResearchDetails({id,summary,children}:{id:string;summary:string;children:ReactNode}) {
  const [mounted,setMounted]=useState(false);
  return <details id={id} className="sift2-command__evidence" onToggle={e=>{if(e.currentTarget.open)setMounted(true);}}>
    <summary>{summary}</summary>{mounted ? children : null}
  </details>;
}
