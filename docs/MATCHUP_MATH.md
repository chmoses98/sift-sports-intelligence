# Matchup math — investigation (redesign pass 1)

**Verdict: the published `advantage_to_offense` is sign-inverted for every efficiency pair. Sift no longer
draws it. The fix belongs upstream in `nfl-edge-finder`; Sift does not substitute its own formula.**

## What the owner saw

> Patriots offense +0.032, Bills defense −0.015 — the chart sums them and shows that above the bar.

The old Sift matchup board drew `extensions.matchup_pairs[].advantage_to_offense` from the event-research
document as a bar between the two units. For NE pass offense vs BUF pass defense the publication says:

| field | value |
|---|---|
| `offense_rating` (NE `adj_off_db_epa`) | +0.03225 |
| `defense_rating` (BUF `adj_def_db_epa`) | −0.01505 |
| `advantage_to_offense` | **+0.04730** = 0.03225 − (−0.01505) |

So it is not a sum of the two magnitudes by accident — it is *offense minus defense*, and that is the problem.

## What each rating means (from the publication's own metric registry)

`explorer/metrics.json`, `met_nfl.adj_def_db_epa`:

> Opponent-adjusted rating … the team's defensive coefficient from the weighted ridge in
> `nfl_edge.research.team_ratings.solve_ratings`: **y = league mean + off_team + def_opponent + hfa** …
> **Defensive ratings are what the defence allows above average: lower is better.** (`higher_is_better: false`)

Offensive ratings are the offense's coefficient in the same model (higher is better).

## What the interaction should be

Under the rating model itself, the expected outcome of offense O against defense D (as a deviation from
the league mean, before home-field advantage) is

```
expected = off_O + def_D          (def_D = what D allows above average)
```

A good defense has a **negative** `def_D` and pulls the expectation **down**. The published figure is

```
advantage_to_offense = off_O − def_D
```

which **adds** a good defense's quality to the offense. The upstream code's own comment says the opposite
of what it computes (`nfl_edge/handicap/packet.py`, `matchup_advantages`):

```python
# Defensive ratings are stored as points allowed above average: lower is better, so a good
# defence (negative) reduces the offence's expected edge.
edge = round(o - d, 5)
if off_key == "off_sack_rate":
    edge = round(-(o) - d, 5)     # sacks allowed and sacks generated both hurt the offence
```

The sack pair is handled with the right structure (−(o + d), oriented so positive favours the offense);
the six efficiency pairs (pass, run, early-down, explosive, overall, neutral-script) are not.

## How wrong it is on a real game (NE @ BUF, 2026 week 4)

| Pair | off | def | published `o − d` | model structure `o + d` | ranks |
|---|---|---|---|---|---|
| BUF pass O vs NE pass D | +0.134 | −0.088 | **+0.222** | +0.046 | BUF #2 vs NE #4 |
| NE run O vs BUF run D | −0.010 | +0.051 | **−0.061** ("edge to defense") | +0.041 | NE #21 vs BUF **#31** |
| NE pass O vs BUF pass D | +0.032 | −0.015 | +0.047 | +0.017 | NE #11 vs BUF #15 |
| NE explosive O vs BUF explosive D | +0.008 | +0.006 | +0.002 | +0.015 | NE #4 vs BUF #24 |

The second row is the clearest failure: Buffalo's run defense ranks **31st of 32** (it allows the
second-most EPA per rush), yet the published number calls the matchup an edge *to Buffalo's defense*. The
first row overstates Buffalo's passing edge almost five-fold because New England's pass defense is
*good*. Sorting `matchup_pairs` by `|advantage_to_offense|` (as the publication does) therefore puts the
wrong matchups first, and the old Slate card's "Largest matchup gap" hook repeated it.

Separately from the sign, the published pairs omit `hfa` (one league-wide scalar in the model), and the
two ratings come from different sides of one ridge fit with no standard errors, so even `o + d` would be
"the model's point expectation", not a calibrated edge.

## What Sift does now (no new metric invented)

* The matchup board shows each unit's **league rank of 32** and its own rating, with each team's bar under
  its own label (offense on the left, the defense it faces on the right). Nothing is summed or subtracted.
* An info note explains why there is no single edge number.
* The slate card hook built on `advantage_to_offense` is removed; the overview's model read uses ranks.
* Sift's handicap packet (`src/packet/*`, unchanged) does not carry `matchup_pairs`. The upstream RUN NFL
  packet and its rendered report (`nfl_edge/handicap/render.py`) do print `advantage_to_offense`, so readers
  of those still see the inverted value until it is fixed upstream.

## Upstream fix (owner decision)

In `nfl-edge-finder/nfl_edge/handicap/packet.py::matchup_advantages`, the efficiency pairs should be

```python
edge = round(o + d, 5)   # expected deviation for this offense against this defense (hfa excluded)
```

with the sack pair unchanged, the field name kept or renamed (e.g. `expected_vs_league`), and the
`matchup_pairs` sort re-run. This changes a value inside published packets, so it is an owner/upstream
decision; Sift will draw a combined bar again only once the publication carries a corrected value.
