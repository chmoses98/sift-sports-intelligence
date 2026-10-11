// Owner items 8 and 13: scripts name the actual teams everywhere they render (NFL, NHL, soccer), and a long
// description splits into one tight sentence plus the expandable rest.
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { readNhl, isNhlScripts } from '../src/lib/nhl';
import { isSoccerEngine, readSoccerEngine } from '../src/lib/soccer';
import { nhlScriptWords, scriptLower, soccerScriptDefinition, soccerScriptTitle, splitSentence } from '../src/lib/scriptNames';
import { readFileSync } from 'node:fs';

const doc = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as EventResearchDoc;

describe('team-specific script words', () => {
  it('NHL: control scripts carry the club nickname, sentences the club place, never a bare tricode', () => {
    const w = nhlScriptWords({ id: 'AWAY_CONTROL', label: 'STL controls and pulls away', short: 'STL control', summary: 'STL holds the territorial edge on the road and wins by two or more.', side: 'away' }, { home: 'CHI', away: 'STL' });
    expect(w.label).toBe('Blues control and pull away');
    expect(w.short).toBe('Blues control');
    expect(w.summary).toBe('St. Louis holds the territorial edge on the road and wins by two or more.');
    const g = nhlScriptWords({ id: 'GOALIE_DRIVEN', label: 'Goaltending steals it', short: 'Goalie steals it', summary: 'One team is clearly out-shot and wins anyway behind its goaltender.' }, { home: 'CHI', away: 'STL' });
    expect(g.label).toBe('Goaltending steals it');
    expect(g.summary).toBe('St. Louis or Chicago is clearly out-shot and wins anyway behind its goaltender.');
  });

  it('NHL: the real publication decodes with the clubs named', () => {
    const s = readNhl(doc('tests/fixtures/nhl/app/latest/explorer/events/evt_c4a2cf978d0824a1493a.json'));
    expect(isNhlScripts(s)).toBe(true);
    if (!isNhlScripts(s)) return;
    const labels = s.scripts.map((x) => x.label);
    expect(labels).toContain('Blackhawks control and pull away');
    expect(labels).toContain('Blues control and pull away');
    for (const x of s.scripts) expect(`${x.label} ${x.summary}`).not.toMatch(/\b(CHI|STL)\b/);
    expect(scriptLower('Blues control and pull away')).toBe('Blues control and pull away');
    expect(scriptLower('St. Louis control')).toBe('St. Louis control');
    expect(scriptLower('Back-and-forth game')).toBe('back-and-forth game');
  });

  it('soccer: "Home control" reads as the club, definitions name both clubs', () => {
    const names = { home: 'Arsenal', away: 'Leeds United' };
    expect(soccerScriptTitle('HOME_CONTROL', 'Home control', names)).toBe('Arsenal in control');
    expect(soccerScriptTitle('AWAY_CHASE', 'Away chase', names)).toBe('Leeds United fight back');
    expect(soccerScriptTitle('TIGHT_LOW_EVENT', 'Tight, low event', names)).toBe('Tight, low event');
    expect(soccerScriptDefinition('Away side scores first; home side recovers at least a draw.', names)).toBe('Leeds United scores first; Arsenal recovers at least a draw.');
    const e = readSoccerEngine(doc('tests/fixtures/soccer/app/latest/explorer/events/' + 'evt_588a4c8417a2e976344d.json'));
    // That fixture's engine is unavailable; the decoder still must not throw.
    expect(e).toBeTruthy();
  });

  it('soccer: a real fixture with scripts never says home/away side', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = 'tests/fixtures/soccer/app/latest/explorer/events/';
    let checked = 0;
    for (const f of readdirSync(dir)) {
      const e = readSoccerEngine(doc(dir + f));
      if (!isSoccerEngine(e)) continue;
      checked++;
      for (const s of e.scripts) {
        expect(s.title).not.toMatch(/^(Home|Away) (control|chase)$/);
        expect(s.definition).not.toMatch(/\b(home|away) side\b/i);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('splits a description into one tight sentence and the rest', () => {
    expect(splitSentence("BYU's sustained-efficiency edge turns into longer drives. Iowa State chases.")).toEqual({ lead: "BYU's sustained-efficiency edge turns into longer drives.", rest: 'Iowa State chases.' });
    expect(splitSentence('St. Louis holds the territorial edge on the road and wins by two or more.').rest).toBeNull();
    expect(splitSentence('')).toEqual({ lead: '', rest: null });
  });
});
