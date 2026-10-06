# Stadium media system

The NFL game hero, the featured card and the week tiles sit over the **actual venue of the event**, shown
with a **genuine photograph of that venue** that the owner approved, or the designed floodlit fallback
when no approved photograph exists. A good fallback is better than a fake stadium.

Nothing here generates, reconstructs or recolours a stadium. A photograph is shown as photographed: it is
cropped, resized and (for the legacy Commons set) given a restrained colour grade, all recorded.

| Piece | File | What it is |
| --- | --- | --- |
| Venue manifest | `scripts/stadiums/venues.json` | One entry per **physical** venue: names, aliases, location, roof, service dates, tenancies |
| Photo registry | `scripts/stadiums/photos.json` | One entry per **photograph**: provenance, transformations, crop, captured conditions, approval |
| Crop targets | `scripts/stadiums/crop-targets.json` | Where photos are shown, the measured box shapes, and the derived files |
| Core library | `scripts/stadiums/lib.mjs` | Crop geometry, validation and derivation, shared by the CLI, the fetcher and the tests |
| CLI | `scripts/stadiums/cli.mjs` (`npm run stadiums -- …`) | `validate`, `audit`, `import`, `approve`, `reject`, `legacy-mobile` |
| Commons fetcher | `scripts/stadiums/fetch.mjs` (workflow *Stadium images*) | Turns a proposed Commons file into a **candidate**. It never approves |
| Contact sheets | `scripts/stadiums/candidates.mjs` (workflow *Stadium candidates*) | Curation aid only |
| App: venue + photo | `src/lib/venues.ts` | Resolves an event to a venue and selects an approved photo |
| App: scene | `src/lib/stadium-scene.ts` | Weather and roof decision rules |
| Import inbox | `stadium-import/` (git-ignored except README) | Owner-supplied originals |
| Tests | `tests/stadiums.test.ts`, `e2e/stadiums.spec.ts`, `scripts/check-dist.mjs` | |
| Audit | `docs/STADIUM_AUDIT.md` (`npm run stadiums -- audit`) | |

## 1. Event → venue

1. **The publication's venue wins**: `context.venue.name`, else `context.venue.stadium`, else
   `context.weather.stadium`. This covers neutral sites, international games and temporary homes.
2. A published name resolves through the manifest by its current name or any alias (former and
   sponsor-free names). Matching ignores case, accents and punctuation: *Levis Stadium* = *Levi's Stadium*.
3. When two physical venues carried the same name at different times, **the game's date** decides. For
   example, *Highmark Stadium* means `highmark-stadium-1973` before 2026-06-01 and `highmark-stadium` after.
   *Nissan Stadium* means the 1999 stadium through the 2026 season and `nissan-stadium-2027` after.
4. The home team's **tenancy on the game date** is used only when the publication names no venue and does
   not mark the game neutral.
5. **A published venue the manifest does not know stays unresolved.** The fallback artwork shows the
   published name. It is never swapped for the nominal home team's stadium.

Historical truth is never overwritten: a move or rename adds a tenancy or alias with dates, and the old
venue stays in the manifest. Service dates use the season-boundary convention `YYYY-06-01`.

`validateVenues` enforces: kebab-case unique slugs, required fields, roof, kind, coordinates, tenancies
inside the venue's service window, **no name shared by two venues in service at the same time**, and **no
team with two overlapping home tenancies**.

## 2. Photo selection

* Only `status: "approved"` photos are served. Statuses `candidate`, `rejected` and `retired` are never
  served. Their files must not be in `public/stadiums/`, and `check-dist` fails the build if one is.
* Every file in `public/stadiums/` must belong to an approved photo with a matching sha256: no
  "mystery images".
* If a venue has several approved photos, the one whose `captured.light` matches the game's light
  (computed below) wins. **Light is matched by choosing a real photo, never by relighting one.**
* Otherwise the venue gets the designed fallback (`StadiumFallback`), exactly as before.

## 3. Composition standard (one visual family)

* Inside the bowl, facing the field, from a believable **football** spectator or broadcast position.
* Recognisable architecture (roof, videoboard, bowl rim, light banks) readable behind the UI.
* Enough field to ground the frame, strong depth, premium editorial or broadcast feel.
* No soccer or concert configurations, no construction-era views (unless the venue is under
  construction now), no watermarks, no AI artifacts, no fake or wrong signage, scoreboard, seating bowl or
  skyline, and no surreal geometry or exaggerated reflections.
* Desktop and mobile may use **different crops of the same photograph**. Images are never stretched.

## 4. Crops

Each approved photo has three derivatives, made from the original by `deriveAll` (or, for the legacy set,
the mobile file is cut from the committed desktop file):

| File | Name | Geometry | Size cap | Used by |
| --- | --- | --- | --- | --- |
| desktop | `<id>.webp` | the whole frame | ≤ 2400 × 1600, WebP q66 | hero and featured card at ≥ 720 px |
| mobile | `<id>-m.webp` | 3:4, full height, placed by `crop.mobile_focus` (default `crop.focus`) | ≤ 1050 × 1400, q62 | hero and featured card below 720 px |
| card | `<id>-sm.webp` | 3:2, placed by `crop.card_focus` (default `crop.focus`) | 720 × 480, q60 | week tile strip (lazy) |

Crop metadata (normalised source coordinates):

* `crop.focus {x, y}`: the desktop `object-position` (x = 0.5 is centre).
* `crop.mobile_focus`: an optional separate framing of the mobile crop.
* `crop.keep {x0, y0, x1, y1}`: **the identifying architecture**, which must remain visible.

Targets, with the box shapes **measured on the approved UI** at base `6206a7e`:

| Target | File | Box aspect (w/h) | Must keep | Measured |
| --- | --- | --- | --- | --- |
| DESKTOP HERO | desktop | 1.2 – 6.4 | 100 % of `keep` | 1.26 @768, **4.3 @1280 (1080 × 253 px)**, 4.9 @1440, 6.2 @1920 |
| MOBILE HERO | mobile | 0.55 – 0.85 | 100 % | 0.61 – 0.78 on 375 – 430 px phones |
| HOME FEATURED CARD | desktop / mobile | 1.3 – 3.4 / 0.55 – 0.85 | 100 % | 1.42 – 3.30 / 0.61 – 0.74 |
| SMALL GAME TILE | card | 2.3 – 3.5 | 50 % | 2.4 – 3.4 (118 px tall) |

Guidance that follows from those shapes:

* **Desktop hero.** The visible band is only about 23 % of a 3:2 photo's height at 1920 px (25 % at
  1280 px). Put `focus.y` where the roofline, videoboard or bowl rim is, not on the field. Keep the
  `keep` rectangle under about 0.22 of the height. `npm run stadiums -- audit` prints a suggested focus y.
* **Mobile hero.** The visible strip is about 37 – 57 % of a 3:2 photo's width. Keep the identifying
  feature within the middle third, or set `mobile_focus.x`.
* **Featured card.** It is between the two, and usually passes when both heroes pass.
* **Tile.** A 118 px strip: it carries atmosphere more than identity, so half of `keep` is enough.

`cropReport` computes the share of `keep` each target shows across its whole aspect range. For a photo
approved under **standard 2** (this phase's bar), any shortfall blocks approval and fails CI. The 9 legacy
photos (**standard 1**) are measured and reported, not blocked. See the audit.

## 5. Weather and roof (decision matrix)

`stadiumScene()` in `src/lib/stadium-scene.ts` is pure and deterministic. Its inputs are the venue's
construction, the publication's roof status (`context.venue.roof` / `context.weather.roof`), the kickoff
forecast (`context.weather`) and the sun at the venue.

| Venue roof | Published roof | Exposure | Sky / precip used? | Label |
| --- | --- | --- | --- | --- |
| fixed (`dome`) | anything, even `outdoors` | `indoor` | no | Indoor |
| any | `dome` | `indoor` | no | Indoor |
| retractable | `closed` | `roof-closed` | no (nothing falls on the field) | Roof closed |
| retractable | `open` | `roof-open` | yes, the outdoor forecast | Roof open |
| retractable | not published (`null` / `''`) | `roof-unknown` | **no, never guessed** | Roof status not published |
| outdoor | anything else | `outdoor` | yes | Open air |
| unresolved venue | not published | `unknown` | no | — |

Forecast classification (NWS short forecast + probability):

| Condition | Rule |
| --- | --- |
| SNOW | snow / flurries / sleet / wintry / blizzard, **and** the forecast commits (≥ 50 %, or no "chance / slight / scattered / isolated" wording) |
| RAIN | rain / showers / drizzle / thunder / storm, committed as above |
| PARTLY CLOUDY / OVERCAST | cloudy / overcast / fog / haze / partly sunny / partly cloudy, or uncommitted precipitation |
| CLEAR / SUNNY | sunny / clear / fair |
| no forecast | no sky, no precipitation |

**Night**: the sun at the venue 90 minutes after kickoff is below −0.833° (low-precision almanac,
± 0.5°). This puts most of the game under lights. 1 pm games are day, and late-season 4:25 pm games in
the north are night.

That gives at most **8 outdoor states** (day or night × clear, cloud, rain or snow), plus indoor,
roof-closed, roof-unknown and unknown. There is no combinatorial asset set: these are presentation
states, not images.

**Atmosphere layers allowed over a photo** (`allowedLayers`):

* No layer over an `indoor` photograph, or when the field is covered or the roof status is unknown.
* `overcast` only over a **day** photo (a night photo is already dark).
* `rain` / `snow` only when the forecast commits to precipitation and the field is open.
* **Light is never changed.** Day is not turned into night or the reverse. A different approved
  photograph is chosen instead.

**First delivery renders no layer.** The scene key and allowed layers are on the hero background as
`data-scene` / `data-layers`, which are inert and change no pixels. Rendering them is the next phase,
after owner review. The intended treatment is a restrained CSS layer above the `<img>` and below the
existing grade, so the photograph file is never edited:

* **Rain:** a fine, low-contrast streak texture with a slight cool desaturation, no mirror reflections on
  turf, text contrast unchanged.
* **Snow:** sparse, small flakes, with no accumulation unless the capture reports it.
* **Overcast:** a cooler, flatter tone curve over the sky band only.
* **`prefers-reduced-motion`:** no animation (the layers are static anyway).

The weather **text** block (`WeatherBlock`) is the accessible source of truth and is unchanged. The
photograph is decorative (`aria-hidden`, `alt=""`).

## 6. Provenance

For every served file you can answer "what original photograph is this derived from?" from
`photos.json`:

* **`source`** records the kind (`wikimedia-commons` | `owner-supplied`), the Commons `file` and page
  `url`, `author`, `rights_holder`, `license` and `license_url`, and the `original` width, height and
  sha256 (owner) or sha1 (Commons). It also records `retained_by` (where the original lives) and the
  `retrieved` / `imported` date.
* **`transformations`** gives the exact ImageMagick operation for each derivative.
* **`files`** gives each derivative's path, size, bytes and sha256. The unit tests re-hash every served
  file.
* **`approval`** records who approved it, when and against which bar. A standard-2 approval affirms every
  item of the owner's quality bar (`QUALITY_BAR` in `lib.mjs`).
* **`review`** holds audit notes for the owner.

**Originals.** Commons originals stay on Commons (their page and sha1 are recorded). Owner-supplied
originals are **not committed**: the repository is public and licences differ. They stay in
`stadium-import/` locally and in the owner's archive, named in `retained_by`. The sha256 ties every
served file to that exact original.

## 7. Owner-supplied import

See `stadium-import/README.md`. In short:

1. Drop `<venue-slug>/<photo>.jpg` plus a `<photo>.json` sidecar (author, licence, captured conditions,
   crop) into `stadium-import/`.
2. `npm run stadiums -- import` validates each pair. It checks for a sidecar, a known venue, a source of at
   least 2400 × 1300 in landscape 1.25 – 2.4, author, licence and captured conditions, and skips a
   duplicate sha256. It then makes the three derivatives under `curation/stadiums/candidates/` (never
   served), records provenance and prints the crop report.
3. The owner reviews the candidate.
4. `npm run stadiums -- approve <id> --by <owner> --affirm-quality-bar` moves the files into
   `public/stadiums/`. Approval is **refused** if any crop would cut the identifying architecture. Use
   `reject <id> --reason …` otherwise.

Commons proposals take the same path. Add a `candidate` entry with `source.file`; the *Stadium images*
workflow fetches it with the author and licence that Commons states, and it still needs owner approval.

## 8. Performance

* WebP only. The desktop file is capped at 2400 px. **Phones download the 3:4 mobile crop** (median
  262 KB) instead of the desktop file (median 665 KB), which cuts the phone hero and featured-card
  download by about 60 %.
* The file is chosen before the first fetch (`useMediaQuery`), so a phone never downloads both.
* Tiles use the 720 × 480 card file and load lazily when near the viewport (`useInView`).
* Backgrounds are absolutely positioned (`inset: 0`), so an arriving photo causes no layout shift.
* Service worker: stadium files are **not precached** (`check-dist` asserts it). They are cached on view
  (CacheFirst, `sift-stadiums`, 80 entries, 30 days).
