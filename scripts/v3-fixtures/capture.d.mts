// Types for capture.mjs (the e2e helpers use fetchOne and journal in live mode).
export interface JournalRecord { url: string; status: number; contentType: string | null; fetchedAt: string; sha256: string | null; bytes: number; tool: string; error?: string }
/** One live fetch through curl; the body is written to `file` only on HTTP 200. */
export function fetchOne(url: string, file: string, o?: { timeout?: string | number; attempts?: number }): Promise<JournalRecord>;
/** Appends a record to <dir>/journal.jsonl. */
export function journal(dir: string, rec: JournalRecord): void;
