# Backend backlog (future; nothing here is authorized for implementation)

Collected from the SIFT 3.0 design rounds. These are wishes for the publications SIFT reads; no backend change is part of the design work.

## 1. Curated related-statistics list in the metric registry

Today the registry's `related_metrics` field is empty for the statistics SIFT 3.0 shows, so the Stat Detail "Related statistics" list is derived from category and names in the client. That derivation must not become permanent.

Requirements (approved 2026-10-26):

- Relationships reference **stable metric IDs** (for example `met_nfl.adj_off_db_epa`), never display names or name matching.
- Each relationship preserves **sport**, so a relation never crosses sports implicitly.
- Each relationship preserves the **definition of both ends**: the related metric's ID resolves to its own registry entry (name, unit, direction, window, universe).
- **Raw and opponent-adjusted** versions are separate metrics. A relation between them is explicit and typed (`raw_counterpart`, `adjusted_counterpart`); a related list never merges them or implies they are interchangeable.
- Each relationship carries the **applicable entity types** (team, player, game) so a team statistic never lists a player-only statistic as related.
- Curated, ordered, and typed with a reason code so the interface can label the link:

```
metric_id: met_nfl.adj_off_epa
related:
  - { metric_id: met_nfl.adj_off_db_epa,   relation: component,            entity_types: [TEAM] }
  - { metric_id: met_nfl.adj_off_rush_epa, relation: component,            entity_types: [TEAM] }
  - { metric_id: met_nfl.adj_def_epa,      relation: opposing_unit,        entity_types: [TEAM] }
  - { metric_id: met_nfl.off_epa_play,     relation: raw_counterpart,      entity_types: [TEAM] }
```

- Validation in the publisher: every referenced ID exists in the same registry, sport matches, relations are symmetric where declared so, and adjusted/raw pairs point at each other.

## 2. Other data gaps recorded by the design rounds

| Gap | Why it matters | Where it showed up |
| --- | --- | --- |
| Player-level league rankings and percentiles (all sports) | Player comparison can show values but no rank. | SD5 |
| Historical league ranks (past seasons) | Season-over-season rank comparisons are blank. | SD2, SD7 |
| Per-game overtime and shootout flag (NHL) | Loss rows cannot be split into regulation and overtime. | TR6 |
| One schedule source for game start times | Explorer and Kalshi disagreed for TOR at CGY. | TR, PD |
| MLB team profiles kept current | The cache stops in late August. | Team Research |
| Closing lines by game | Against the spread and over/under records. | TR3 |
| Position-level defensive splits, teammate-out, weather history | Locked facets in Player Research and Prop Discovery. | P3, P4, PD4 |
| Prop price history | "Price move since open" facet. | PD4 |
| Home/away statistics (not just results) | Publication states no stored home/away splits. | TR |
