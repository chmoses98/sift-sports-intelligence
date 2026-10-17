import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReliabilityLine, ValidationState } from '../src/components/IntelligenceNote';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import { decodeIntelligence, hasValidatedOpportunities, INTELLIGENCE_URL, NO_VALIDATED_WORDS, reliabilityFor } from '../src/lib/intelligence';

const doc = (validated: string[] = []) => ({
  schema: 'sift.disagreement_status.v1', authority: 'RESEARCH_ONLY', generated_at: '2026-10-17T00:00:00Z',
  message: validated.length ? 'x' : NO_VALIDATED_WORDS,
  sample_accounting: { independent_player_stat_games: 4012 },
  projection_accuracy: { by_stat: { receptions: { brier_model_minus_market: 0.04, brier_se: 0.005, mean_outcome_minus_model_prob: 0.15, independent_units: 737 },
                                    touchdowns: { brier_model_minus_market: 0.001, brier_se: 0.002, mean_outcome_minus_model_prob: 0.01, independent_units: 900 } } },
  betting_signals: { validated_segments: validated, model_error_segments: ['receptions|all'], status_counts: { UNRESOLVED: 29, MODEL_ERROR: 1 } },
});

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(null); });

describe('intelligence contract', () => {
  it('decodes only the documented schema with research authority', () => {
    expect(decodeIntelligence(doc())?.independentUnits).toBe(4012);
    expect(decodeIntelligence({ ...doc(), schema: 'other' })).toBeNull();
    expect(decodeIntelligence({ ...doc(), authority: 'ACTIONABLE' })).toBeNull();
    expect(decodeIntelligence(null)).toBeNull();
  });
  it('validated means the engine listed a validated segment, nothing else', () => {
    expect(hasValidatedOpportunities(null)).toBe(false);
    expect(hasValidatedOpportunities(decodeIntelligence(doc()))).toBe(false);
    expect(hasValidatedOpportunities(decodeIntelligence(doc(['receptions|model_below_market'])))).toBe(true);
  });
  it('reliability reads the scorecard and claims nothing for an unscored stat', () => {
    const s = decodeIntelligence(doc());
    expect(reliabilityFor(s, 'receptions')).toMatchObject({ tone: 'caution' });
    expect(reliabilityFor(s, 'receptions')!.line).toMatch(/market has been the more accurate.*low by about 15 points/);
    expect(reliabilityFor(s, 'touchdowns')!.tone).toBe('ok');
    expect(reliabilityFor(s, 'longest_rush')).toBeNull();
  });
});

describe('components', () => {
  it('shows the informative no-validated state when the contract is missing', async () => {
    setFetchJson(async (url) => { throw new NotFoundError(url); });
    render(<ValidationState />);
    expect(await screen.findByTestId('validation-state')).toHaveTextContent(/No validated opportunities/);
    expect(screen.getByTestId('validation-state')).not.toHaveTextContent(/^Validated/);
  });
  it('shows no-validated when the engine lists none, and validated only when it lists one', async () => {
    setFetchJson(async (url) => { expect(url).toBe(INTELLIGENCE_URL); return doc(); });
    const a = render(<ValidationState />);
    expect(await screen.findByTestId('validation-state')).toHaveTextContent(/No validated opportunities/);
    a.unmount();
    clearAsyncMemo();
    setFetchJson(async () => doc(['receptions|model_below_market']));
    render(<ValidationState />);
    await waitFor(() => expect(screen.getByTestId('validation-state')).toHaveTextContent(/1 segment\(s\) passed/));
  });
  it('renders the reliability line for a scored stat and nothing otherwise', async () => {
    setFetchJson(async () => doc());
    const a = render(<ReliabilityLine stat="receptions" />);
    expect(await screen.findByTestId('projection-reliability')).toHaveTextContent(/737 player-games/);
    a.unmount();
    const b = render(<ReliabilityLine stat="longest_rush" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(b.container).toBeEmptyDOMElement();
  });
});
