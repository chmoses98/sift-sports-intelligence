// Research Lab card, yes/no stats: scored by Brier score in their own table (never "miss"/MAE), read from the versioned
// pf_core 1.3.0 scorecard; count stats keep their average miss and 80% range. SIFT's real approvals keep anytime_td HELD, so
// this test stands in for a future promotion by mocking the approvals module: nothing in the app's approvals changes.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import card from './fixtures/pf-scorecard/nfl-season.pf_core-1.3.0.json';
import { NotFoundError, setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import { scorecardUrl, summaryUrl } from '../src/lib/projections';

vi.mock('../src/lib/projectionApprovals', async (orig) => {
  const actual = await orig<typeof import('../src/lib/projectionApprovals')>();
  const promoted = (family: string) => ({ ...actual.APPROVALS.find((a) => a.sport === 'NFL' && a.family === 'receptions')!, family, decision: 'PROMOTED' as const, engine: 'foundation' as const, publication: undefined });
  const APPROVALS = [...actual.APPROVALS.filter((a) => !(a.sport === 'NFL' && ['receptions', 'anytime_td'].includes(a.family))), promoted('receptions'), promoted('anytime_td')];
  return { ...actual, APPROVALS, engineFor: (sport: string, family: string) => (sport === 'NFL' && ['receptions', 'anytime_td'].includes(family) ? 'foundation' : actual.engineFor(sport, family)) };
});
const { ProjectionScorecard } = await import('../src/components/ProjectionScorecard');

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(null); });

const summary = {
  schema: 'sift.projection_foundation.sport_summary.v1', sport: 'NFL', splits: { holdout: '2024-2025 seasons' },
  families: [
    { family: 'receptions', readiness: 'READY', readiness_reason: 'r', best_model: 'F', holdout: { n_obs: 6160, mae: 1.552, crps: 1.063, cover_80: 0.81 } },
    { family: 'anytime_td', readiness: 'SHADOW VALIDATION', readiness_reason: 'r', best_model: 'F', holdout: { n_obs: 6965, mae: 0.3434, crps: 0.17248, cover_80: 0.7983 } },
  ],
};
const serve = (live: unknown) => setFetchJson(async (url) => {
  if (url === summaryUrl('NFL')) return summary;
  if (url === scorecardUrl('NFL')) return live;
  throw new NotFoundError(url);
});
const challenger = (name: string) => (card.families.find((f) => f.family === name)!.models as Record<string, unknown>[]).find((m) => m.model_role === 'challenger')!;

describe('Research Lab card with a yes/no stat live', () => {
  it('shows Brier score for the yes/no stat and average miss for the count stat, each from its own metric of the 1.3.0 card', async () => {
    serve(card);
    render(<ProjectionScorecard sport="NFL" />);
    const yesno = await screen.findByTestId('pfs-live-yesno');
    await waitFor(() => expect(within(yesno).getByRole('row', { name: /Anytime td/ })).toHaveTextContent('120'));
    const row = within(yesno).getByRole('row', { name: /Anytime td/ });
    const brier = (challenger('anytime_td').brier as number).toFixed(3);
    const bias = challenger('anytime_td').bias as number;
    expect(row).toHaveTextContent(`0.172`);                                              // historical Brier = the study's holdout CRPS of a 0/1 outcome
    expect(row).toHaveTextContent(brier);                                                // live Brier from the card
    expect(row).toHaveTextContent(`${bias >= 0 ? '+' : '−'}${Math.abs(bias * 100).toFixed(1)} pts`);
    expect(row.textContent).not.toContain((challenger('anytime_td').mae as number).toFixed(2));   // never the MAE
    expect(within(yesno).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Yes/no stat', 'Historical Brier score', 'Live settled', 'Live Brier score', 'Forecast chance vs actual rate', 'Monitoring']);
    expect(yesno.textContent).not.toMatch(/miss|80%/i);
    expect(screen.getByTestId('pfs-yesno-note')).toHaveTextContent(/Brier score/);

    const counts = screen.getByTestId('pfs-live-in-sift');
    const crow = within(counts).getByRole('row', { name: /Receptions/ });
    expect(crow).toHaveTextContent('1.55');                                              // historical miss, unchanged
    expect(crow).toHaveTextContent((challenger('receptions').mae as number).toFixed(2)); // live miss, unchanged
    expect(within(counts).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Stat', 'Historical miss', '80% range caught', 'Live settled', 'Live miss', 'Live bias', 'Monitoring']);
    expect(within(counts).queryByText(/Anytime td/)).toBeNull();                         // the yes/no stat is not in the miss table
  });

  it('a card that predates 1.3.0 never falls back to MAE for the yes/no stat: its live Brier cell is empty', async () => {
    const legacy = JSON.parse(JSON.stringify(card));
    for (const f of legacy.families) { delete f.outcome_type; for (const m of f.models) { delete m.outcome_type; delete m.brier; delete m.primary_metric; } }
    serve(legacy);
    render(<ProjectionScorecard sport="NFL" />);
    const row = within(await screen.findByTestId('pfs-live-yesno')).getByRole('row', { name: /Anytime td/ });
    await waitFor(() => expect(row).toHaveTextContent('120'));
    expect(row.textContent).not.toContain((challenger('anytime_td').mae as number).toFixed(2));
    expect(row.querySelectorAll('td')[2]).toHaveTextContent('—');
  });

  it('before any game has settled, the yes/no stat waits in the yes/no table, not the miss table', async () => {
    serve({ ...card, families: [] });
    render(<ProjectionScorecard sport="NFL" />);
    const yesno = await screen.findByTestId('pfs-live-yesno');
    expect(within(yesno).getByRole('row', { name: /Anytime td/ })).toHaveTextContent('Accuracy appears as games finish and settle');
    expect(within(screen.getByTestId('pfs-live-in-sift')).queryByText(/Anytime td/)).toBeNull();
  });
});
