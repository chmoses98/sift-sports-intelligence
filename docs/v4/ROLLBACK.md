# SIFT v4 early access: rollback

v4 is an **opt-in early-access** interface at `https://chmoses98.github.io/sift-sports-intelligence/#/v4`. SIFT 2.0 is the default for everyone and stays so at every step below. Nothing here deletes saved research.

**Restore point (before v4): `main` @ `a2f1a64`** (immutable history).

## What v4 changed outside `src/v4/`

Five files, all additive, with YES as the default so every pre-existing save renders exactly as before:

| File | Change |
| --- | --- |
| `src/App.tsx` | the `/v4` routes; `UiGate` sends a remembered v4 choice to `/v4` |
| `src/lib/uiMode.ts` | `v4` as a third remembered mode (`sift.ui`), `exitV4`, `rememberV4` |
| `src/state/tray.tsx` | optional `side` on a label; `restore`; providers in one page stay in sync |
| `src/board/model.ts`, `src/views/board/BoardView.tsx` | the SIFT 2.0 Board reads a save's side (`side ?? 'YES'`) |

Saved research is one device-local store (`sift.researchTray.v1`) shared by v4 and SIFT 2.0. v4 never rewrites an existing item's `item_id`, `added_at`, note or price snapshot (tested).

## Levels, least to most

### 0. You, on your phone (instant, no deploy)

- **Return to SIFT 2.0**: the link at the foot of every v4 screen, or in the *v4 early access* sheet. It also forgets "Keep v4 on this device".
- **Remove the *SIFT v4* Home Screen icon** (press and hold, Remove App, Delete App). That icon is a separate app with its own saved Board; deleting it does not touch Safari's copy or a SIFT 2.0 icon.
- Your SIFT 2.0 icon, if you have one, was never changed.

### 1. Pause v4 for everyone, no code change (recommended)

About 45 to 60 minutes (the full CI suite gates every deploy; the v4 stack's own runs took 46 to 56 minutes).

1. GitHub, *Settings*, *Secrets and variables*, *Actions*, *Variables*: create **`SIFT_V4` = `off`**.
2. *Actions*, **Deploy to GitHub Pages**, *Run workflow* on `main`. (The 3-hourly scheduled deploy reads the same variable, so the pause persists.)

Effect: every `#/v4…` address shows *SIFT v4 early access is paused* with an **Open SIFT 2.0** button, and forgets a kept v4 choice. A *SIFT v4* Home Screen icon opens that notice. SIFT 2.0, the classic interface, their routes, side-aware Board display and all saved data are unchanged.

Resume: delete the variable (or set it to anything other than `off`) and run the workflow again.

### 2. Remove v4 from the site

Open a PR on `main` that reverts the v4 merge commit (`git revert -m 1 <merge sha>`) and merge it; `deploy.yml` redeploys. Rebuild check: `npm ci && npm run build && node scripts/check-dist.mjs`.

Known consequence: this also removes the SIFT 2.0 Board's side reading. A save made on the **NO** side in v4 is a separate item that still exists, but the older SIFT 2.0 Board shows it against the YES ask. It is not lost, and re-deploying v4 restores the correct display. This is why level 1 is the better first step.

## Knowing it is healthy

The **Production check** workflow runs after every Pages deploy (and on demand: *Actions*, *Production check*, *Run workflow*). Its step *SIFT v4 early access* walks the journey on the live site with real data in Chromium phone and WebKit iPhone (SIFT 2.0 still default, `#/v4` installs as "SIFT v4", Home, Games, Game, Props, Research, Save, Board, Undo, the same research on SIFT 2.0, a pre-v4 save untouched, price ages against the quote feed, a returning visit offline). Parts that cannot apply today print `N/A` with the reason. When `SIFT_V4=off` it checks only the paused notice and that SIFT 2.0 is untouched, so a deliberate pause does not turn it red. Screenshots are the `production-check` artifact (`production-v4-*.png`). A red step here means the live site differs from what CI proved: use level 1.

## After any change

- The service worker (`registerType: autoUpdate`) replaces cached files on the next load; an installed iPhone web app picks up the new version after one relaunch. The *v4 early access* sheet shows the build this copy runs and the latest published build.
- A deploy, including a rollback deploy, runs the full suite first. If it trips on a known live-market WebKit flake, re-run the failed jobs.
- Check the live site: `https://chmoses98.github.io/sift-sports-intelligence/version.json` names the commit that is deployed.

## What is deliberately not part of v4

NBA projections are not activated, betting and research authority are unchanged, and no live-score infrastructure is touched (`live-quotes.yml`, the relay and the quote feed are as they were). v4 states that live scores are unavailable; nothing is estimated.
