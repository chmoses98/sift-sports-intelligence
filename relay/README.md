# Sift quote relay (optional, for sub-minute quotes)

Kalshi's public market-data API refuses browser requests from any origin except kalshi.com
(`Origin: https://chmoses98.github.io` → HTTP 403, no CORS headers; evidence in
`docs/ARCHITECTURE.md` → *Direct browser access vs relay*). Sift therefore reads live quotes either
from the **quote feed** (GitHub Actions, published every 3 minutes, no setup) or, for the owner's
15–60-second targets, from this **read-only relay**.

The relay:

* forwards only `GET /markets` with `tickers` (≤ 100), `event_ticker` or `series_ticker`
  (+ `status`, `limit`, `cursor`) to `https://api.elections.kalshi.com/trade-api/v2`, without an Origin;
* answers with CORS only for Sift's origins (others get 403, so it is not an open proxy);
* holds **no secret** — the data is public — and cannot reach any order, portfolio or account endpoint;
* stamps `X-Sift-Observed-At` (Kalshi's `Date` minus `Age`), the time Sift measures freshness from;
* shares identical requests across users for 5 seconds at the edge.

## Deploy (owner, ~5 minutes, free)

```bash
cd relay
npx wrangler login          # once: opens Cloudflare in the browser (free account)
npx wrangler deploy         # prints https://sift-quote-relay.<your-subdomain>.workers.dev
```

Then in GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**
`SIFT_QUOTE_RELAY_URL` = `https://sift-quote-relay.<your-subdomain>.workers.dev` (a public URL, not a
secret), and run **Actions → Deploy to GitHub Pages → Run workflow** (or wait for the 3-hour schedule).
Sift then uses the relay first and falls back to the quote feed automatically if the relay fails.

Check it: `https://sift-quote-relay.<sub>.workers.dev/markets?series_ticker=KXNFLGAME&status=open&limit=2`
returns JSON; Sift's *Data & provenance → Live market quotes* shows *Answered by kalshi-relay*.
