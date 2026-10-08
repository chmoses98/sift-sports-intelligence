# Game heroes

Every game page opens with a hero. A visitor should be able to tell at a glance **whose home game it is**, or that
**nobody is at home** (a neutral site, or a feed that does not state the home side), without reading anything.

The order of priority:

1. the correct home-team identity;
2. the authentic home venue;
3. atmosphere.

A correct branded hero is always better than an incorrect photograph. The hero shows a photograph only when it is a
verified frame of **that team's** home game at **that venue** in **that era**. Otherwise it shows the team's own designed
identity. It never falls back to a generic stadium.

## Where it lives

| Piece | File | Role |
| --- | --- | --- |
| Venues | `src/lib/hero/venues.json` | One entry per *physical* venue: name, former names, city, roof, kind, and **dated home tenants per sport**. A shared building lists every tenant (MetLife: Giants and Jets; TD Garden: Bruins and Celtics; Hard Rock: Dolphins and the Miami Hurricanes). |
| Photos | `src/lib/hero/photos.json` (generated) | Approved photographs keyed by **sport + team + venue + era**, with focus points and the Commons credit. |
| Pins | `scripts/heroes/pins.json` | The human-reviewed source of `photos.json`: which Commons file, what in it shows the team's identity, and who reviewed it and when. |
| Blocklist | `scripts/heroes/blocklist.json` | Wrong-event files that must never come back (Super Bowl LIX at the Superdome and others). A test fails if one is pinned. |
| Rules | `src/lib/hero/rules.json` | Standing neutral-site matchups that no feed states (Red River, Florida–Georgia, Army–Navy). |
| Resolver | `src/lib/hero/resolve.ts` | `resolveHero(input) → HeroSpec`: the **one** decision. It is pure and date-aware. |
| Inputs | `src/lib/hero/input.ts` | Reads each publication's own venue, neutral-site and home-confidence shapes. |
| Art | `src/components/HeroArt.tsx`, `src/styles/hero.css` | One look for the game hero, featured card, tiles, the CBB hero and historical games. |
| Gallery | `#/design/heroes` (`src/views/HeroGallery.tsx`) | Every team's hero per sport, plus the edge cases, drawn by the same code. |

Pages never pick an image. They call `resolveHero` and render the spec. Each hero carries inert
`data-hero-kind / -context / -team / -venue / -photo / -reason` attributes for tests and the production check.

## The decision

`resolveHero` works through these steps in order:

1. **No home teams (tennis).** The hero shows the event's identity.
2. **Home side not stated.** A display-order convention, such as the CFB feed's `event_title_order`, makes the hero a
   *matchup*: both teams are shown, the separator reads "vs", and no one is shown at home.
3. **Neutral site.** This applies when the publication says so (`neutral_site`, `location: Neutral`, CBB `neutral`), when
   the game is a standing neutral matchup in its usual month, or when the published venue is a neutral-site building.
   Both teams are shown. The label reads "Neutral site", "International game", or the event's own name. A venue photo
   is used only when it is flagged `neutralOk`, meaning no tenant's branding dominates the frame.
4. **Venue named by the publication.**
   - If the building is the home team's home **on that date**, the hero shows the approved photo of *that team* there,
     or else the team's branded hero.
   - If it is a known building but not their home that day, the context is *home-elsewhere*: the team's identity is
     shown with no stadium photo, labelled "Hosted by the X".
   - If the building is not in the registry, the hero shows the team's identity with no photo.
5. **No venue named.**
   - Postseason games show the host's identity, never its stadium.
   - Otherwise the hero uses the team's single home venue on that date.
   - A split season (Kansas in 2024) or an unknown venue shows the identity only.

A shared name is resolved by date and by home team. Examples include old and new Highmark Stadium, the 1999 and 2027
Nissan Stadium, and the many "Memorial Stadium"s. Historical games resolve to the venue *as it was*.

## Adding or replacing a photograph

1. Push to a `claude/hero-curation*` branch, or run the **Hero candidates** workflow. It renders numbered contact
   sheets of free-licence Commons photos per home team, found by searching **team identity** first, under
   `curation/heroes/<sport>/`.
2. Review the full frame. It must show **this team's** identity (end zones, centre-ice or court logo, uniforms,
   signage) at **this venue**, from an era that matches the building. It must not be another event (a Super Bowl, a
   bowl game, soccer, a concert) and must not be a player close-up.
3. Add a pin to `scripts/heroes/pins.json` with the file, the identity, the focus points, any `from`/`to` era, and the
   review note.
4. Push. The **Hero images** workflow downloads the original, makes the 2400, 1200 and 720 px WebP files, reads the
   licence from Commons itself, rewrites `photos.json`, and removes any file no pin owns.
5. `npm test` (`tests/heroRegistry.test.ts`) fails if a photo's team is not a tenant of its venue in its era, if a
   licence is not free, if a file is missing, or if a blocklisted file appears.

New teams, venues or seasons only need entries in `venues.json` (and `team-names.json` for curation). No page component
changes.

## Rights

The photographs are free-licence Wikimedia Commons files (CC0, CC BY or CC BY-SA). Each is credited on the hero and on
**Status → Game photo credits**, with its licence and Sift's modifications (resized and colour graded). CC BY-SA
requires derivative images to be shared under the same licence, and the served WebP files are. Team logos are the
committed logo files Sift already uses for identification. Trademark review of league and school marks remains an owner
item before any commercial launch.
