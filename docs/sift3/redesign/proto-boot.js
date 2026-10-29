/* Guided journeys: each step lists what to tap and completes on its own when the walkthrough reaches the right screen. The check
   runs against the real router state, so a journey only advances when the correct destination actually opened. */
(function () {
  const E = window.PE, S = E.S;
  const lamb6 = (c) => c.name === 'player' && c.p.name === 'CeeDee Lamb' && c.ui.k === 6 && c.ui.site === 'away' && c.ui.win === 'L10' && c.ui.tab === 'Overview';
  const J = [
    { id: 'j1', title: 'Prop Discovery → Player Research → Stat Detail → Team Research → Game Matchup', start: () => E.root('pdhome'), steps: [
      ['Tap a prop card to open it in the list (try the first card).', (c) => c.name === 'pdlist' && c.ui.exp],
      ['Tap Research on the expanded prop to open the player.', (c) => c.name === 'player'],
      ['Open the Matchup tab and tap the opponent’s pass-defense strip. If the player has no matchup rows, tap the opponent chip on the prop.', (c) => c.name === 'stat'],
      ['In the ranking, tap a team’s name or logo.', (c) => c.name === 'team'],
      ['Tap the next-game strip, then open the Matchup tab.', (c) => c.name === 'game' && c.ui.tab === 'Matchup'],
      ['Press Back to see the game’s source exactly as you left it.', () => S.last === 'back'],
    ] },
    { id: 'j2', title: 'Game Detail → Matchup → statistic → league ranking', start: () => E.root('games'), steps: [
      ['Open Dallas at Philadelphia.', (c) => c.name === 'game' && c.p.key === '26OCT26DALPHI'],
      ['Open the Matchup tab (or tap “Where it tilts”).', (c) => c.name === 'game' && c.ui.tab === 'Matchup'],
      ['Tap a unit’s rank or value, for example “PHI defense · 28th”, or open the SIFT Lens evidence and tap a gap.', (c) => c.name === 'stat' && c.ui.tab === 'Ranking'],
      ['Press Back: the Matchup tab returns at the same scroll position.', (c) => S.last === 'back' && c.name === 'game' && c.ui.tab === 'Matchup'],
    ] },
    { id: 'j3', title: 'Team Research → Schedule → Game Detail → Player Research', start: () => E.root('team', { t: 'DAL' }), steps: [
      ['Open the Schedule tab.', (c) => c.name === 'team' && c.ui.tab === 'Schedule'],
      ['Tap the Philadelphia row (the date or name opens the game; the logo opens the team).', (c) => c.name === 'game'],
      ['Tap a player under “Players to research”.', (c) => c.name === 'player'],
      ['Press Back twice: Schedule returns with the Schedule tab selected.', (c) => c.name === 'team' && c.ui.tab === 'Schedule' && S.last === 'back'],
    ] },
    { id: 'j4', title: 'Prop Discovery → expanded prop → comparison → exact contract', start: () => E.root('pdlist'), steps: [
      ['Tap a row to expand it (the row, not the name or price).', (c) => c.name === 'pdlist' && c.ui.exp],
      ['Tap Compare, tick two or three rows, then tap the Compare button in the tray.', (c) => c.name === 'compare'],
      ['Tap Contract under a column to open the exact contract.', (c) => c.name === 'compare' && c.ui.sheet && c.ui.sheet.t === 'contract'],
      ['Close the contract and press Back: the list returns with your selections and expanded row.', (c) => c.name === 'pdlist' && S.last === 'back' && c.ui.cmp.length >= 2],
    ] },
    { id: 'j5', title: 'Saved research → restore the exact state', start: () => E.root('saved'), steps: [
      ['Tap “CeeDee Lamb · REC 6+” (saved with L10, away games, the 6+ line).', lamb6],
      ['Press Back, then open it again: the same line, window and filter come back every time.', (c) => lamb6(c) && S.last === 'go' && S.jOpened === 2],
    ] },
  ];
  let opened = 0;
  E.afterRender.push((c) => { if (c.name === 'player' && S.last === 'go') { opened++; S.jOpened = opened; } check(); });
  function check() { const j = S.jid && J.find((x) => x.id === S.jid); if (!j) return; const c = E.cur(); let moved = false; while (S.jstep < j.steps.length && j.steps[S.jstep][1](c)) { S.jstep++; moved = true; } coach(j); }
  function coach(j) {
    const el = document.getElementById('coach'); if (!j) { el.hidden = true; return; }
    const done = S.jstep >= j.steps.length;
    el.hidden = false;
    el.innerHTML = `<div class="ch"><b>${done ? 'Journey complete' : `Step ${S.jstep + 1} of ${j.steps.length}`}</b><span class="dots">${j.steps.map((_, i) => `<i class="${i < S.jstep ? 'done' : i === S.jstep ? 'on' : ''}"></i>`).join('')}</span></div><p>${done ? 'Every destination opened as designed. Try Back to retrace it, or pick another journey.' : j.steps[S.jstep][0]}</p><div class="cb"><button id="cSkip">${done ? 'Close' : 'Skip step'}</button><button id="cExit">Exit journey</button></div>`;
    document.getElementById('cSkip').onclick = () => { if (done) E.endJourney(); else { S.jstep++; coach(j); } };
    document.getElementById('cExit').onclick = () => E.endJourney();
  }
  E.endJourney = () => { S.jid = null; S.jstep = 0; document.getElementById('coach').hidden = true; };
  E.startJourney = (id) => { const j = J.find((x) => x.id === id); S.jid = id; S.jstep = 0; opened = 0; S.jOpened = 0; document.getElementById('jlist').hidden = true; S.last = 'go'; j.start(); check(); window.scrollTo(0, 0); };
  E.journeys = J;
  document.getElementById('bJ').onclick = () => { const l = document.getElementById('jlist'); l.hidden = !l.hidden; l.innerHTML = J.map((j, i) => `<button data-j="${j.id}"><b>Journey ${i + 1}</b>${j.title}</button>`).join(''); l.querySelectorAll('button').forEach((b) => (b.onclick = () => E.startJourney(b.dataset.j))); };
  E.init(); E.root('pdhome'); E.fit();
})();
