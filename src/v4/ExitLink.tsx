import type { ReactNode } from 'react';
import { exitV4 } from '../lib/uiMode';

/** A real exit from v4 into another interface: forgets the remembered v4 preference first, so nothing redirects back. */
export function ExitLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <a className={className} href={`#${to}`} onClick={exitV4}>{children}</a>;
}
