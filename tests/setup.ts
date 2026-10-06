import '@testing-library/jest-dom/vitest';
import { setLiveStore } from '../src/live/hooks';
import { QuoteStore } from '../src/live/store';

// Unit/integration tests never reach a real quote provider: screens get a store with no provider
// (tests that exercise live quotes install their own fixture-backed store).
setLiveStore(new QuoteStore({ provider: null, persistence: null }));
import { setHistoryBase } from '../src/history/load';
// The history layer reads public/data/nfl/history through the same disk fetch as the publication.
setHistoryBase('disk://history');

import { configure } from '@testing-library/react';
// Screen tests render real pages that load several documents (publication, history, props) before the
// section a test looks for appears; a shared CI runner can take longer than Testing Library's 1 s default.
configure({ asyncUtilTimeout: 10_000 });
