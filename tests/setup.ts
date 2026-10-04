import '@testing-library/jest-dom/vitest';
import { setLiveStore } from '../src/live/hooks';
import { QuoteStore } from '../src/live/store';

// Unit/integration tests never reach a real quote provider: screens get a store with no provider
// (tests that exercise live quotes install their own fixture-backed store).
setLiveStore(new QuoteStore({ provider: null, persistence: null }));
