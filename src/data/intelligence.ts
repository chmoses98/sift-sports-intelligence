// Reads the projection-intelligence contract. A missing, unreachable or unrecognised document is `null`, which every consumer
// treats as "nothing validated" (src/lib/intelligence.ts) — never as an error banner and never as an approval.
import { getJson } from './fetcher';
import { useAsync } from './hooks';
import { decodeIntelligence, INTELLIGENCE_URL, type IntelligenceStatus } from '../lib/intelligence';

export function useIntelligence(): { status: IntelligenceStatus | null; loading: boolean } {
  const r = useAsync<IntelligenceStatus | null>('intelligence:status', () => getJson<unknown>(INTELLIGENCE_URL).then(decodeIntelligence, () => null), { revalidate: true });
  return { status: r.data ?? null, loading: r.loading };
}
