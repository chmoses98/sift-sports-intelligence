export const STEPS: readonly (readonly [string, number])[];
export const MAX_PX: number;
export function snapPx(px: number): readonly [string, number] | null;
export function transform(css: string, opts: { fallback: boolean }): { out: string; stats: { sizes: number; shorthand: number; weights: number; families: number; byStep: Record<string, number> } };
