# SIFT v4 early access

An opt-in preview for one person's daily use. **SIFT 2.0 is the default for everyone**; v4 only appears when you open it. This is not a general launch: real iPhone Safari, VoiceOver and on-device performance checks are still required before one.

**Address:** `https://chmoses98.github.io/sift-sports-intelligence/#/v4`
**Rollback:** [ROLLBACK.md](ROLLBACK.md)

## Choosing and remembering v4

Opening `#/v4` chooses nothing: the device still opens SIFT 2.0 afterwards. Three ways to choose, all explicit:

| Where | What it does |
| --- | --- |
| **Keep v4 on this device** (the card on v4 Home, or the *v4 early access* sheet) | the device opens v4 first, including from an old bookmark or a SIFT 2.0 launch address |
| **`?ui=v4`** (`…/#/?ui=v4`) | the same, as before |
| **Return to SIFT 2.0** (foot of every v4 screen, and the sheet) | opens SIFT 2.0 and forgets "keep v4"; a SIFT 2.0 or classic choice made earlier comes back |

## On the iPhone Home Screen

Open the v4 address in **Safari**, on v4 Home, then Share, **Add to Home Screen**, keep the name **SIFT v4**, Add.

- The page installs as its own app ("SIFT v4", launch address `#/v4`), chosen from the address you add it from, so the icon opens v4 whichever way iOS picks its launch address. It is separate from any SIFT 2.0 icon.
- **The Home Screen app keeps its own saved Board.** iOS gives each Home Screen app storage separate from Safari (Apple, WWDC23 "What's new in web apps"). Research saved in Safari does not appear in the icon and the other way round. Pick one place for daily use.
- In the Home Screen app there is no "keep v4" prompt: the icon is the choice. Return to SIFT 2.0 is still one tap.
- Not verifiable without a device: whether iOS takes the launch address from the page or from the manifest. Both paths are set to v4; see the checklist.

## What works today

- **Home, Games, Game**: the published slate by league and day, lifecycle groups, the game page (Live, Matchups, Players, Markets).
- **Props and player detail**: the NFL Prop Explorer with side-aware (YES / NO) pricing, projection where one is published, and the research sheet.
- **Signals**: the published research signals and where each stands (current, passed, no longer current).
- **Save and Board**: save a side-specific market or prop; the Board groups by game and category, compares the saved price with the latest quote **of the same contract and side** when that quote is current, and says plainly when it is stale, missing, or the contract is closed. **Your notes** can be added, edited and cleared; **Undo** puts the last removed item back exactly as it was. Saved research is shared with SIFT 2.0 on the same device.
- Prices say how old they are. Missing data is said, never replaced by zero.

## What does not work yet

- **Live scores, game clocks and plays are unavailable.** A game "in play" is the publication's status; v4 shows "Score unavailable" and never estimates one. A final shows the published score only when one is published. The separate live-score integration is not part of this release.
- **NBA projections are not active** and no betting or research authority has changed. SIFT does not recommend bets.
- Items without a v4 screen (a saved team, metric, ranking) open the SIFT 2.0 page they came from.
- Undo covers the last single removal while you stay on the Board; Clear Board is confirmed and cannot be undone.
- No account, no sync across devices: the Board lives on the device.

## What a person must still test on a real iPhone

1. Add to Home Screen from Safari: the icon is labelled **SIFT v4** and **opens v4** (not SIFT 2.0). If it opens SIFT 2.0, report which iOS version.
2. The Home Screen app's first launch, a return the next day, and after force-quitting it: the Board you saved is still there.
3. Typing a note: the keyboard opens, the page does not zoom, the sheet stays usable, and Save works.
4. VoiceOver through Home, a game, a prop, the research sheet, Save, the Board, and Undo (the Undo bar is announced).
5. Scrolling and sheet drag feel smooth on a real device; no layout is clipped by the Dynamic Island or home indicator.
6. After a new deploy, the app updates itself within one relaunch (the *v4 early access* sheet shows the build number).
7. Safari tabs: WebKit's tracking-prevention policy can clear a site's saved data after about a week without a visit, while a Home Screen app counts its own use (WebKit commentary; not tested here). Prefer the icon, and tell me if a Board ever comes back empty.
