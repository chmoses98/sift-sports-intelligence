#!/bin/bash
# usage: caps.sh OUTDIR   (renders the full 390 state set from the server on :8099)
cd "$(dirname "$0")"; T=$1; mkdir -p $T
s(){ node shot.mjs "$@" 2>&1 | grep -v -E "404|console.error"; }
s Main.dc.html $T/01-home-live.png
s Main.dc.html $T/01b-home-upcoming.png '[{"scroll":"#sc","y":520}]'
s HomePublished.dc.html $T/02-home-published.png
s Main.dc.html $T/03-home-friday.png '[{"click":"button.day >> text=Fri"}]'
s Main.dc.html $T/04-home-sheet.png '[{"click":"button.sigchip"},{"wait":700}]'
s Game.dc.html $T/05-game-live.png
s Game.dc.html $T/06-game-plays.png '[{"scroll":"#sc","y":420}]'
s GamePregame.dc.html $T/07-game-pregame.png
s GameFinal.dc.html $T/08-game-final.png
s Game.dc.html $T/09-game-matchups.png '[{"click":"button.gtab >> text=Matchups"},{"scroll":"#sc","y":232}]'
s Game.dc.html $T/10-game-players.png '[{"click":"button.gtab >> text=Players"},{"scroll":"#sc","y":232}]'
s Game.dc.html $T/11-game-markets.png '[{"click":"button.gtab >> text=Markets"},{"scroll":"#sc","y":232}]'
s Game.dc.html $T/12-game-sheet.png '[{"click":"button.sigline"},{"wait":700}]'
s Signal.dc.html $T/13-signals-sheet.png
s Signal.dc.html $T/14-signals-list.png '[{"click":"button[aria-label=Close]"},{"wait":500}]'
APPW=375 APPH=667 s Main.dc.html $T/17-home-se.png '[]' 375 667
APPW=375 APPH=667 s Game.dc.html $T/18-game-se.png '[]' 375 667
APPW=375 APPH=667 s Signal.dc.html $T/19-signals-se.png '[]' 375 667
