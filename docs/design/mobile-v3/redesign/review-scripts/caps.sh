#!/bin/bash
# usage: caps.sh OUTDIR [SCALE]   renders the redesign screen set (server on :8096 serving redesign/source)
cd "$(dirname "$0")"; T=$1; export SCALE=${2:-2}; mkdir -p $T
s(){ node shot.mjs "$@" 2>&1 | grep -v -E "404"; }
s Home.dc.html $T/01-home-live.png
s Home.dc.html $T/01b-home-scrolled.png '[{"scroll":"#sc","y":560}]'
s HomePublished.dc.html $T/01c-home-published.png
s Home.dc.html $T/01d-home-signal-sheet.png '[{"click":".gr .sigchip"},{"wait":800}]'
s Game.dc.html $T/02-game-live.png
s Game.dc.html $T/02b-game-live-plays.png '[{"scroll":"#sc","y":430}]'
s Game.dc.html $T/02c-game-signal-sheet.png '[{"click":".sigrow"},{"wait":800}]'
s GamePregame.dc.html $T/02d-game-pregame.png
s GameFinal.dc.html $T/02e-game-final.png
s Game.dc.html $T/03-game-matchups.png '[{"click":"button.gtab >> text=Matchups"}]'
s Game.dc.html $T/04-game-players.png '[{"click":"button.gtab >> text=Players"}]'
s Game.dc.html $T/05-game-markets.png '[{"click":"button.gtab >> text=Markets"}]'
s Props.dc.html $T/06-props-explorer.png
s PropsDetail.dc.html $T/06b-props-detail.png
s PropsDetail.dc.html $T/06c-props-sheet.png '[{"click":".anote"},{"wait":800}]'
s Signals.dc.html $T/07-signals.png
s Signals.dc.html $T/07b-signal-sheet.png '[{"click":".sigbtn"},{"wait":800}]'
