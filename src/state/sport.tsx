// The sport a screen belongs to: its resolved source, repo, capability manifest and metric registry.
import { createContext, useContext, type ReactNode } from 'react';
import type { Capability, CapabilityManifestDoc, MetricDef, QualityStatus } from '../contract/types';
import type { SportRepo } from '../data/repo';
import type { SportConfig } from '../data/sports';

export interface SportCtx {
  sport: SportConfig;
  slug: string;
  repo: SportRepo;
  caps: Map<string, Capability>;
  capDoc: CapabilityManifestDoc | null;
  metrics: Map<string, MetricDef>;
}

export const SportContext = createContext<SportCtx | null>(null);

export function SportProvider({ value, children }: { value: SportCtx; children: ReactNode }) {
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportCtx {
  const v = useContext(SportContext);
  if (!v) throw new Error('useSport outside a sport route');
  return v;
}

const SHOWABLE: QualityStatus[] = ['VERIFIED', 'PARTIAL', 'RESEARCH'];

/** Capability-aware rendering: a capability is shown only when the manifest says the data exists. */
export function capStatus(caps: Map<string, Capability>, name: string): QualityStatus {
  return caps.get(name)?.status ?? 'UNKNOWN';
}

export function capShown(caps: Map<string, Capability>, name: string): boolean {
  return SHOWABLE.includes(capStatus(caps, name));
}
