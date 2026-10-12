// The tie share and the honesty note beside the winner-specific close scripts (owner item #14).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CloseSplitNote } from '../src/views/game/ScriptTab';

describe('close-split note', () => {
  it('states the tie share with one decimal and never calls the split odds', () => {
    render(<CloseSplitNote tie={0.0019} />);
    const note = screen.getByTestId('close-split-note');
    expect(note.textContent).toMatch(/Ties after overtime: 0\.2% of simulated games, no winner, so not a script\./);
    fireEvent.click(screen.getByRole('button', { name: /About the close-game split/ }));
    expect(document.body.textContent).toMatch(/as accurate as the point spread alone/);
    expect(document.body.textContent).toMatch(/not odds/);
  });
});
