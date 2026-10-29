export function checkShape(url: string, j: unknown): string | null;
export function verifyBundle(dir?: string, o?: { maxTotalMb?: number; scan?: boolean }): { errs: string[]; notes: string[]; total?: number };
