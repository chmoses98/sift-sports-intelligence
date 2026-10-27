export interface WebFixtureDocument { status: number; body: Uint8Array; text(): string }
export interface WebFixtureFamily { name: string; clock: { captured_at: string; basis: string }; urls: string[]; get(url: string): Promise<WebFixtureDocument | null> }
export interface WebBundle { index: unknown; families(): string[]; family(name: string): WebFixtureFamily }
/** Opens a fixture bundle over HTTP (base URL of the directory holding index.json and packs/). */
export function openWebBundle(base: string, fetchImpl?: typeof fetch): Promise<WebBundle>;
