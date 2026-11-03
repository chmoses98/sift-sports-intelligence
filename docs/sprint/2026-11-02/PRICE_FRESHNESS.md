# Why prices were "—": measured delivery path (PR #172, review item 3)

Measured 2 Nov 2026 ~15:00–15:20 UTC.

| Hop | Measurement |
|---|---|
| Published market documents (`event_detail`) | `captured_at 01:53:14Z`; the NFL publication was ~13 h old at 15:00. Never displayable (limit: 180 s far / 90 s near / 60 s live). |
| Live feed (`live-quotes` branch, GitHub Actions) | Healthy: `status CURRENT_SLATE`, 84 requests, 0 errors, `observed_at` 14:59:47Z for 762 CHI@SEA contracts; sweep every ~2.7 min (`sequence 11` after 30 min). |
| Feed over `raw.githubusercontent.com` | Served with `cache-control: max-age=300`. A browser reading the feed sees a quote that is a publish cycle **plus up to 5 min of CDN cache** old, i.e. often over the 180 s list limit → the gate correctly withholds it. In my captures prices showed (52¢, 51¢, 50¢…) when the feed was fetched uncached and read "3 min old" when it was not. |
| Quote relay (`sift-quote-relay.vercel.app`) | **Not reachable from this sandbox** (proxy answers 403 to the CONNECT). Could not be verified here. The relay README reports 0.7 s median / 14.7 s max quote age, which is what the limits assume. Production needs `SIFT_QUOTE_RELAY_URL` set at build time (`deploy.yml`). |

Conclusion: with no relay, the feed alone cannot meet the display rule most of the time. That is a delivery limitation, not a UI bug; the gate is unchanged. What changed in this PR is that the viewer is told the reason, the last observation time and can Retry, and the two states can be reproduced:

```
# fresh feed (prices print)            -> docs/sprint/2026-11-02/04-game-props-tab.png, 05-game-to-research.png
# feed unreachable / stale (withheld)  -> 04b-game-props-price-withheld.png, 05b-research-price-withheld.png
```

Follow-ups: (1) verify the deployed relay from a networked machine (`quote-monitor` / `relay-production-verify` workflows already do); (2) consider a cache-busting query on the feed read (`?t=<minute>`) — raw.githubusercontent honours `max-age` per URL, so a per-minute query would cut CDN age to ≤ 1 min at the cost of more requests; (3) decide whether the list limit for far-from-start games (180 s) should be relaxed for the feed-only fallback — a product decision, not made here.
