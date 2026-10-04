# Sift quote relay (read-only)

Kalshi's public market-data API refuses browser requests from any origin except kalshi.com
(`Origin: https://chmoses98.github.io` → HTTP 403, no CORS headers; evidence in
`docs/ARCHITECTURE.md` → *Direct browser access vs relay*). Sift therefore reads live quotes from this
**read-only relay** first (15–60 s quotes) and falls back to the **quote feed** (GitHub Actions, every
3 minutes, no setup) whenever the relay fails.

The relay:

* forwards only `GET /markets` with `tickers` (≤ 100), `event_ticker` or `series_ticker`
  (+ `status`, `limit`, `cursor`) to `https://api.elections.kalshi.com/trade-api/v2`, without an Origin;
* answers with CORS only for Sift's origins (`https://chmoses98.github.io`, `http://localhost:4173`,
  `http://localhost:5173`); any other origin gets 403, so it is not an open proxy;
* holds **no secret** (the data is public), has no Kalshi login or API key, and cannot reach any order,
  portfolio, balance or account endpoint; every other path or parameter gets 400, every write 405;
* stamps `X-Sift-Observed-At` = Kalshi's `Date` minus `Age`, the time Sift measures freshness from; a
  shared answer keeps its original stamp, so a quote is never presented as younger than it is;
* passes Kalshi's **429** through with `Retry-After` (readable by the browser), so Sift backs off and
  the feed answers; it never retries into a rate limit and never invents data;
* answers 502 (malformed or unreachable upstream) or 504 (Kalshi slower than 8 s), with CORS, so Sift
  falls back instead of hanging;
* shares identical reads for 5 seconds (and merges identical reads already in flight).

Files: `core.ts` (all behaviour), `api/markets.ts` + `vercel.json` + `package.json` + `public/`
(Vercel host), `kalshi-quote-relay.ts` + `wrangler.toml` (legacy Cloudflare host). Tests:
`tests/relay.test.ts`.

## Host: Vercel (Hobby, free)

Why Vercel, checked October 2026:

| | Separate egress from Cloudflare | Free for Sift's scale | Sleeps when idle | Deploy without a terminal | Notes |
|---|---|---|---|---|---|
| **Vercel Functions** | yes (AWS) | Hobby, non-commercial | no (serverless; cold start well under a second) | yes (import the GitHub repo) | pauses at a limit instead of billing |
| Deno Deploy | yes (GCP) | 1M requests/month | no | yes | platform was rebuilt in 2025; more churn |
| Netlify Functions | yes (AWS) | 300 credits/month, hard cap, then sites pause | no | yes | credits shared with deploys and bandwidth |
| Render web service | yes | 750 h/month | **yes, after 15 min; ~1 min to wake** | yes (render.yaml) | the first quote after idle would always fall back |
| Fly.io | yes | **no free tier for new accounts** (pay as you go) | optional | CLI-first | |
| Railway | yes | trial credit, then paid | no | yes | |

Vercel is the only option that is free, never sleeps, deploys from GitHub with clicks only, and stops
(instead of charging) at its limits. The function runs in `iad1` (Washington, D.C.), near Kalshi.

### Deploy (owner, about 5 minutes, no terminal)

1. Open <https://vercel.com/signup> → **Continue with GitHub** → choose the **Hobby** plan and authorise.
2. Open <https://vercel.com/new> → under *Import Git Repository* find **sift-sports-intelligence** →
   **Import** (if it is not listed: *Adjust GitHub App Permissions* → allow this repository → back).
3. On *Configure Project*:
   * **Project Name**: `sift-quote-relay`
   * **Root Directory**: click **Edit** → select **relay** → **Continue**
   * leave *Framework Preset* as **Other** and everything else as it is → **Deploy**.
4. When it says *Congratulations*, click **Continue to Dashboard** and copy the domain shown under
   *Domains* (for example `sift-quote-relay.vercel.app`, or `sift-quote-relay-<something>.vercel.app`).
5. In GitHub: **Settings → Secrets and variables → Actions → Variables** → `SIFT_QUOTE_RELAY_URL` →
   ✏️ **Edit** → value `https://<the domain from step 4>` (no trailing path) → **Update variable**.
6. In GitHub: **Actions → Deploy to GitHub Pages → Run workflow → Run workflow**.

That deploy rebuilds Sift with the new relay and then runs **Production check** automatically, which
proves the relay is answering (LIVE, FRESH, no fallback), proves the fallback with a forced 429, and
measures the relay with the rate-limit smoke test. Vercel redeploys the relay by itself whenever
`relay/` changes on `main`; other branches (including `live-quotes`, which updates every 3 minutes)
never deploy.

Check it by hand: open `https://<domain>/markets?series_ticker=KXNFLGAME&status=open&limit=2` in a
browser — it answers JSON. Sift's *Data & provenance → Live market quotes* shows *Answered by
kalshi-relay* and *Mode LIVE*.

### Limits that matter (Hobby, checked October 2026; not "free forever")

* **Function invocations: 1,000,000 / month.** Sift makes about 46 relay requests per minute per person
  with a game screen open (measured: 24 ticker batches + 114 series listings in 3 minutes), less on
  other screens and none while the tab is hidden. That is roughly 360 hours of game-screen time a month
  before sharing; identical reads within 5 s are shared, so several friends on the same game cost about
  the same as one.
* **Active CPU: 4 hours / month.** The relay mostly waits on Kalshi, which is not counted as active CPU.
* **Data transfer: 100 GB / month** (fast data transfer), with a smaller allowance for data leaving
  functions (fast origin transfer). Series listings are the large answers; the rate-limit smoke reports
  the average answer size per request so usage can be estimated.
* **Duration:** each request is capped at 15 s (`vercel.json`); the relay itself gives up on Kalshi at
  8 s.
* **Cold starts:** a few hundred milliseconds after idle; no sleeping.
* **Non-commercial use only** on Hobby. When a limit is reached Vercel pauses the project until the next
  month (no bill); Sift then runs on the quote feed automatically. If Sift outgrows Hobby or becomes
  commercial, Vercel Pro is $20/month, or the same `core.ts` can be put on another host.
* **Outbound IPs are shared and dynamic** (AWS). If Kalshi ever throttles them too, the production
  check and the smoke test will show 429s; a dedicated egress IP (Vercel Static IPs is $100/month, or a
  small VM) would be the next step.

## Legacy: Cloudflare Worker

`kalshi-quote-relay.ts` is the original host (`npx wrangler deploy` from this directory). On
2026-10-04 Kalshi answered HTTP 429 to 16 of 17 production requests from it — on the first request,
not after a burst — because Workers share Cloudflare's outbound network. Once the Vercel relay is
configured and verified, the worker is unused; it can be deleted from the Cloudflare dashboard
(*Workers & Pages → sift-quote-relay → Settings → Delete*) whenever convenient. Nothing depends on it.

## Change the allowed origins

Both hosts read `ALLOWED_ORIGINS` (comma-separated). On Vercel: *Project → Settings → Environment
Variables*, then redeploy. Unset means Sift's Pages origin plus local development.
