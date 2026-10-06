# Owner-supplied stadium photographs — import inbox

Everything in this folder except this README is **git-ignored**: originals are imported from here and are
never committed (licences differ; a public repository must not redistribute a licensed original). The
photo registry keeps each original's filename, pixel size, byte size and sha256, so any served file can
be traced back to the exact original.

## Layout

```
stadium-import/
  lambeau-field/                 <- the venue slug from scripts/stadiums/venues.json
    lambeau-night-2025.jpg       <- the ORIGINAL photograph (jpg / png / tif / webp), unedited
    lambeau-night-2025.json      <- its provenance sidecar (same name, .json)
```

## Sidecar

```json
{
  "author": "Jane Photographer",
  "rights_holder": "Agency name (if not the author)",
  "license": "Editorial licence #12345, web use, perpetual",
  "license_url": null,
  "source_url": "https://agency.example/photo/12345",
  "original_retained_by": "Owner's archive: Drive/Sift/stadiums",
  "captured": { "date": "2025-12-21", "event": "Ravens at Packers", "light": "night", "sky": "clear", "configuration": "football (NFL)" },
  "crop": {
    "focus": { "x": 0.5, "y": 0.22 },
    "mobile_focus": { "x": 0.52, "y": 0.3 },
    "keep": { "x0": 0.38, "y0": 0.14, "x1": 0.62, "y1": 0.32 }
  },
  "grade": null,
  "notes": "Upper-deck end-zone view; scoreboard and bowl rim visible."
}
```

* `captured.light`: `day`, `night` or `indoor` (fixed roof / roof closed). `captured.sky`: `clear`, `cloud`,
  `rain`, `snow` or `none` (indoor). These describe the photograph; weather never edits them.
* `crop.keep` is the rectangle of identifying architecture (normalised 0..1 coordinates of the original)
  that every crop must keep: the desktop hero band, the phone crop, the featured card and the tile strip.
* `grade`: `null` (no colour change — the default) or `{ "brightness": 100, "saturation": 112, "contrast": 3 }`.

## Run

```
npm run stadiums -- import                 # every venue folder
npm run stadiums -- import --venue lambeau-field
```

Each valid photo becomes a **candidate**: its desktop, mobile and card derivatives are written to
`curation/stadiums/candidates/` (never served) and the registry records its provenance and a crop report.
Rejected files say why (no sidecar, unknown venue, below 2400 × 1300, not landscape, missing author /
licence / captured).

A candidate is served only after the owner reviews it against the quality bar:

```
npm run stadiums -- approve lambeau-field --by "<owner>" --affirm-quality-bar
npm run stadiums -- reject lambeau-field--night1 --reason "wrong scoreboard (pre-2023)"
```

Approval moves the derivatives into `public/stadiums/` and fails if the crops would cut the identifying
architecture out of any target.
