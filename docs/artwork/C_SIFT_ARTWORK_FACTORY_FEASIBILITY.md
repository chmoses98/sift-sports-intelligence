# C. SIFT Artwork Factory: Feasibility Report

Status: **research, 2026-10-18.** Nothing was installed, generated, downloaded or purchased. Conventions: [V] verified in a primary source or the repository during this audit, [S] from secondary sources (blogs, reviews, search summaries), [U] unverified / inference, [R] recommendation.

**Verification limits of this audit.** The environment could reach GitHub but not huggingface.co, commons.wikimedia.org, unsplash.com, pexels.com, pixabay.com or copyright.gov (DNS failure). Tool facts below marked [V] come from GitHub READMEs and licence files; model-card and stock-site licence statements are [S] and must be re-read at the source before use. There is no Apple Silicon hardware or GPU here, so **no generation was run**. Every statement about generation speed or quality is therefore documentation or third-party reporting, not a measurement.

---

## 1. Verdict

| Question | Answer |
|---|---|
| Can SIFT have a **completely free** artwork workflow? | **Yes**, for everything except licensed athlete photography. Every tool in the recommended stack is free to run locally; none needs a subscription, credits or an API key. |
| Can it be **automated**? | **Mostly.** Planning, prompt assembly, post-processing, optimisation, metadata, review sheets and publishing gates are plain scripts and are proven patterns in this repo. Image *generation* can be driven headlessly on a Mac through a local API, but that step is **unproven here** and needs a one-day spike. |
| Can it be **fully** automated? | **No, and it should not be.** Aesthetic approval, rights judgement and trademark decisions stay human. Generation quality for backgrounds is good enough to be a *candidate generator*, not an unattended publisher. |
| Can it produce **athletes**? | **No.** Not recommended, not feasible without fake-looking results, and contrary to the project's own rules (document A §7). |
| Can it run in **free cloud CI**? | Not for generation [U: GitHub-hosted standard runners have no GPU]. It can run the CPU steps (validate, optimise, test, publish). |
| Hardware | An Apple Silicon Mac the owner already has [U: model and RAM unknown; asked as decision Q1 in F]. 16 GB unified memory is the practical comfort level for SDXL-class and small FLUX-class models [S]. |

**Recommended shape:** a *semi-automated* factory: a local command-line tool that does everything up to a contact sheet, a human who approves, and CI that refuses anything unapproved. About 80 % of the steps are automatic; none of them is hands-off.

---

## 2. Tools, classified by cost and rights

The brief asks to separate completely free local software, free services with limits, paid APIs, and tools with commercial-use restrictions. Classes: **A** = free local software, permissive; **B** = free but with a restriction that matters; **C** = free service with limits; **D** = paid, excluded.

### 2.1 Generation (backgrounds, textures, atmosphere only)

| Tool | Class | Licence / terms | Apple Silicon | Automation | Notes |
|---|---|---|---|---|---|
| **ComfyUI** | A | GPL-3.0 [V, repo] | M1-M4 on recent macOS, via PyTorch **nightly**; desktop app for macOS [V, README] | Local HTTP API: `POST http://127.0.0.1:8188/prompt` with a workflow JSON in API format [V, `script_examples/basic_api_example.py`]; `--disable-partner-nodes` turns off paid API nodes [V] | Best headless driver candidate. Depends on PyTorch nightly, so installs drift (section 7). **Disable partner/API nodes: they are paid cloud calls** |
| **mflux** | A | MIT [V, repo] | Native Apple MLX, `float16` option for M1-family [V, README] | Python/CLI; prompt files and metadata export [V]; no built-in batch [V] | Clean scriptable alternative. Lists many models; **each model has its own licence** (not shown on the page [V]) |
| **InvokeAI** | A | Apache-2.0 plus model-specific files [V, repo] | macOS listed only as a topic tag; support **not stated** [V] | Node/workflow system; API-only models (Nano Banana, GPT Image, Wan) exist and are paid [V: marked "API Only"] | Fine for manual work; not the recommended driver |
| **Fooocus** | A (code) / B (checkpoints) | GPL-3.0 [V]; presets use community checkpoints with their own licences [V: Juggernaut XL, realisticStockPhoto, animaPencil] | Mac is "unofficial", "not intensively tested", M1/M2 named, "about 9x slower than Nvidia RTX 3XXX" [V, README] | None | In **limited long-term support, bug fixes only, SDXL only**, no plans for new architectures [V, README]. Good for manual exploration; **not recommended as a factory backbone** |
| **Draw Things** | A (local) / D (optional cloud) | Free App Store app with in-app purchases; closed source [S]; an optional cloud tier exists [S] | Metal/Core ML native; commonly cited as the fastest Mac option [S] | App-driven, GUI | Excellent for manual look-development; use local mode only; its app licence terms were not verified |

### 2.2 Models: the licence is the constraint, not the app

| Model | Licence | Commercial use of outputs | Status |
|---|---|---|---|
| **FLUX.1 [schnell]** | **Apache-2.0** [V, `black-forest-labs/flux` README] | Yes | **Recommended primary.** 12 B parameters, heavy for 8 GB machines [S] |
| **FLUX.2 [klein] 4B** | Apache-2.0 [S: BFL help centre via search; confirm at the model card] | Yes | Recommended if available locally; smaller and faster than 12 B [S] |
| FLUX.2 [klein] 9B | FLUX Non-Commercial [S] | Local weights need a commercial licence | **Do not use** |
| FLUX.1 [dev] and variants (Fill, Kontext, Redux, Krea, Canny, Depth) | "FLUX.1-dev Non-Commercial License" [V, README] | The licence text says Outputs may be used for any purpose including commercial [V, `LICENSE-FLUX1-dev` §2(d)], but the model itself is non-commercial for "revenue-generating activity" [V, §1(c)], and a §2(e) content-filtering/AI-disclosure condition applies | **Avoid.** The model-versus-output conflict is real and needs a lawyer; schnell removes the question |
| **SDXL 1.0** | CreativeML Open RAIL++-M [S, conflicting sources; not confirmed against the model card] | Permitted with use-based restrictions [S] | Acceptable once the model card is read; the use restrictions (no deception, no unlawful depiction of real persons) are compatible with a no-people policy |
| Stable Diffusion 3.5 | Stability Community License with a revenue threshold [S, unconfirmed] | Conditional | Avoid unless confirmed |
| Z-Image, Qwen-Image, Krea, Ideogram, ERNIE, FIBO etc. (listed by mflux) | **Unknown** [V: the mflux page lists no licences] | Unknown | **Do not use until each model card is read** |
| Community fine-tunes / LoRAs (CivitAI etc.) | Per-file, often restricted | Often not | **Excluded** |

Rule [R]: only models under Apache-2.0 or MIT (schnell, klein 4B), or SDXL after the card is read, enter the factory. The model name, version, licence and a hash of the card text are recorded in every asset's metadata (D §3). Models are downloaded **on the owner's Mac**; they cannot be fetched from this environment.

**Copyrightability.** The US Copyright Office's January 2025 report (Part 2) concludes that prompts alone do not give the user authorship of AI outputs; protection needs human-authored material or human selection, arrangement or modification [S, several law-firm summaries of the report]. Consequence [R]: generated plates are *usable* but SIFT may not be able to stop others copying them. Mitigation: SIFT's art is assembled (plate + effects + team light + type), so the assembled hero has human authorship, and the factory records the human selection.

### 2.3 Editing, vector, 3D, optimisation

| Tool | Class | Licence | Apple Silicon | Role |
|---|---|---|---|---|
| **GIMP** | A | GPL [S] | native | Raster retouch; layer-based plate repair |
| **Krita** | A | GPL [S] | native | Painting, light/texture passes |
| **Inkscape** | A | GPL [S] | native | SVG effects, glyph family, state illustrations |
| **Blender** | A | GPL for the app; renders are the author's [S: general understanding, not confirmed in the search] | Cycles **Metal** GPU backend for Apple Silicon since 3.1 [V, BlenderNation/Cycles Metal announcement] | Scriptable headless renders of unbranded sport objects with **native alpha**, and optionally abstract stages; no AI, no model licence |
| **Photopea** | C (free web, ads) | Its terms state the free editor may be used by anyone for any purpose and users keep ownership [S, terms page via search]; the ad-free option is paid | browser | Optional manual editor; no automation; not required |
| **sharp** | A | Apache-2.0 [V]; WebP and AVIF output [V] | prebuilt arm64 binaries not stated on the README [U] | Resize, crop, AVIF/WebP, stats (mean luminance) in Node, the repo's language |
| **ImageMagick** | A | Apache-style [S] | native | Already used by `scripts/heroes/fetch.mjs:62-63` for the existing 2400/1200/720 WebP set |
| **Playwright / Chromium** | A | Apache-2.0 | native | Render contact sheets, geometry and the real-component legibility test; already in the repo (`scripts/make-icons.mjs`, `e2e/`) |
| **flag-icons** | A | MIT [V] (does not state whether the flag SVGs are covered separately [V]) | n/a | Tennis nationality flags [R, verify the SVG licence before use] |

### 2.4 Background removal and upscaling: where the traps are

| Tool | Licence | Trap |
|---|---|---|
| **rembg** | MIT code [V]; **model weights have their own licences** [V]. Its **default model `bria-rmbg` requires a paid agreement for commercial use** [V]. Two cloud options (`withoutbg`, `atlascloud`) send images to third-party servers [V] | Pin an explicit open model (`isnet-general-use`, `u2net`, BiRefNet) and check that model's licence. **Never run the default.** On Mac it is CPU only per the README (no Mac/GPU guidance given) [V] |
| **BiRefNet** | Repo is MIT [V]; weights licence not stated on the page [V]; the *RMBG-2.0* weights are non-commercial [V] | Confirm weights licence before use |
| **Real-ESRGAN** | BSD-3-Clause [V] | macOS portable binary is described for "Intel/AMD/Nvidia GPU"; Apple Silicon not stated [V]. `outscale` and face enhancement unsupported in the ncnn build [V] |
| **Upscayl** | AGPL-3.0, backend open source [V]; macOS 12+, `.dmg` and Homebrew; **requires a Vulkan GPU, many integrated GPUs don't work** [V]; bundled models (HFA2k, Remacri, UltraSharp) have licences not stated on the page [V]; has a CLI (`upscayl-ncnn`) [V] | Apple Silicon works only through a Vulkan layer [U]. AI upscaling invents detail: **never use it to "improve" a real photograph or a face** |

Rule [R]: background removal is only for *own renders and flat objects*. Blender renders already carry alpha, so rembg may not be needed at all. No athlete is ever cut out.

### 2.5 Excluded (paid, credit-based, or non-commercial)

Midjourney, DALL·E / GPT Image, Adobe Firefly, Leonardo, Ideogram cloud, Canva/Magic Studio credits, Nano Banana, Runway; Draw Things+ cloud; any ComfyUI/Invoke "partner" or "API-only" node; Bria RMBG; FLUX dev/9B; Getty/AP/team-league media. None is needed.

---

## 3. Legally usable sports photography: what free can and cannot give

Principle: **a licence clears the photographer's copyright; it does not clear the athlete's likeness, a team's trademarks, or a league's marks.** Commons says so directly: reusers must check non-copyright restrictions (trademark, personality rights) [S, Commons non-copyright restrictions page via search].

| Source | Rights | Good for | Limits |
|---|---|---|---|
| **Wikimedia Commons** (already the pipeline) | CC0, CC BY, CC BY-SA, public domain; licence in `extmetadata`, already parsed in `fetch.mjs` | Venue and arena frames; the only free source with real home-venue game photography | Attribution (on-image today is 9 px and truncated); BY-SA share-alike on adaptations (64 % of current heroes); frames are frequently dated or mediocre (11 of 100 are only 1600 px wide); visible team and sponsor marks; likeness not cleared |
| **Openverse** | Aggregator over Commons, Flickr, etc.; free API with licence filter [S] | Discovery across CC sources | Openverse states it **does not verify** the licences it aggregates [S]. Always re-verify at the original page. Exclude NC and ND |
| **Flickr CC (via Openverse)** | Mixed | Occasional strong stadium frames | Mislabelled licences are common [U] |
| **US government (DoD / Air Force / DVIDS)** | Many NFL-visit and event photos are marked public domain, "cleared for release" [S] | Rare frames of players at military events | Only military-related events. DoD asks that images of identifiable personnel and implied endorsement be handled per its limitations guidance [S]. A DVIDS Pro Bowl photo was **not** marked public domain [S]. Does not clear NFL likeness or marks |
| **Unsplash, Pexels, Pixabay** | Custom free licences; commercial use without attribution [S]; none lets you build a competing stock service [S] | **Generic** atmosphere: empty arenas, floodlights, turf and court textures, ball close-ups, crowd bokeh | None transfers rights in recognisable people or trademarks [S]; Pixabay is the most explicit about releases and trademarks [S]; few professional sports photos; **primary licence texts were unreachable here and must be read before downloading** |
| Team and league media kits, Getty, AP, ESPN, USA Today | **Licensed, not free** | Exactly the premium athlete photography the brief wants | **Excluded by the no-cost rule.** This is the honest limitation: the best Nike/ESPN-style action photography is behind licences |
| Own photography | Own | Generic textures only | Not realistic as a pipeline |

Trademarks. Team logos and league marks are the chrome of a sports product, and the current practice (identification use) is common, but whether *full logos* qualify as nominative fair use is not settled by what I could find [S: sources discuss word marks and a copyright fair-use case, *Bouchat v. Baltimore Ravens*, not logo display on an analytics site]. The repo already flags it as an owner item (`docs/HEROES.md:79-81`). [R] The art plan **reduces** exposure: art layers use no marks (plates, effects, unit art and glyphs are unbranded); chrome can use SIFT's own sport glyphs instead of league marks; soccer and tennis use monograms and flags rather than unlicensed crests.

Likeness. MLB Players Inc. sued DraftKings, bet365, FanDuel and Underdog in 2024 over unlicensed player likenesses; FanDuel settled, the others were pending at the time of the coverage I found [S: ESPN, ABC/AP, Legal Sports Report]. This is the specific reason the factory and the identity guide do not centre on athlete photography. **Not legal advice.**

**Limitation statement (required by the brief).** For *named athletes in action at premium quality*, no free source with clear usage rights exists at scale. The visually strong alternative is: stage + light + sport-object + team colour (tier B/C in document B), with verified Commons frames where they are genuinely good.

---

## 4. The factory: stages, automation level, evidence

Proposed name: **SAF (SIFT Artwork Factory)**, a Node CLI in the repo's idiom (`scripts/*.mjs`, JSON manifests, GitHub Actions), mirroring the existing `pins.json → fetch.mjs → photos.json` pattern. Section 5 gives the layout; document D gives the schemas.

| # | Step (from the brief) | Automation | How | Evidence status |
|---:|---|---|---|---|
| 1 | Read an asset manifest | **Full** | `art/manifest/assets.yml`, validated by schema | Same shape as `scripts/heroes/pins.json` [V pattern] |
| 2 | Identify missing artwork | **Full** | Diff manifest against `src/lib/art/registry.json` and files on disk; optionally derive the sport list from `src/data/sports.ts` so a new sport shows as missing | Straightforward [R] |
| 3 | Generate prompts from approved templates | **Full** | Handlebars-style templates per sport/surface/aspect + the section 10 vocabulary of document B; deterministic seed families | [R] |
| 4 | Generate artwork locally | **Assisted, unproven** | ComfyUI API queue (verified endpoint) or mflux CLI; N candidates per asset; models limited to section 2.2 | API verified [V]; **throughput and quality on the owner's Mac unmeasured** |
| 5 | Desktop and mobile variants | **Full for crops, assisted for generation** | Generate wide and tall masters **separately at native aspect** with the same seed family; derive card crop by crop-with-focus. Do **not** derive the phone master by cropping the desktop master | Recommended by the geometry in A §3 |
| 6 | Remove backgrounds when necessary | **Rarely needed** | Blender renders have alpha natively. rembg only for flat objects, explicit non-default model | Licence traps verified [V] |
| 7 | Optimise formats and sizes | **Full** | sharp/ImageMagick to AVIF + WebP; size budgets; dominant colour; blur-hash/LQIP | Tools verified [V]; budgets in D §6 |
| 8 | Organise assets | **Full** | Deterministic paths from the manifest ID | [R] |
| 9 | Record settings and source | **Full** | Sidecar JSON: model + licence + card hash, prompt, seed, sampler, steps, workflow JSON, tool versions, date, operator | [R]; required by D |
| 10 | Present for human approval | **Full to build the sheet; human to decide** | Contact sheet + **real-component render**: each candidate dropped into the actual hero CSS at 1352 × 454 and 390 × 250 with real text via Playwright (the repo already does review compositing in `scripts/sift2/compare.py`, `hero-candidates.yml`) | Pattern exists [V]; the PoC in A §8 rendered the layers headlessly in Chromium |
| 11 | Make approved art available to SIFT | **Full, gated** | `saf publish` copies only approved IDs to `public/art/` and updates `src/lib/art/registry.json`; a unit test fails if the registry references an unapproved or unlicensed asset | Mirrors `tests/heroRegistry.test.ts` [V] |

### 4.1 Automated pre-checks (feasible with free libraries)

These remove obvious rejects before a human looks. They **do not** replace human review; they catch gross failures only.

| Check | Method | Catches |
|---|---|---|
| Faces / people | OpenCV Haar or MediaPipe face detector | A person in a plate that should have none (auto-reject) |
| Text / numbers | Tesseract OCR | Gibberish lettering, scoreboard text, fake jersey numbers (auto-reject any hit above a confidence floor) |
| Text-channel luminance | sharp stats on the centre channel; then full contrast measurement after layers are applied in the real component | Plates too bright for the text (D §7) |
| Palette | CIEDE2000 distance of dominant colours to the neutral cool range | Off-brand colour casts |
| Sharpness / banding / tiling | Laplacian variance; histogram gaps; autocorrelation | Soft output, posterisation in gradients, repeated texture |
| Budget | File size and dimensions | Over-budget files |

"Obvious AI artifacts" beyond these (melted geometry, impossible architecture) are a **human** judgement. Because plates contain no people, text or recognisable architecture, the surface for such artifacts is small: this is the main reason to restrict generation to backgrounds.

### 4.2 Approval enforcement (human approval is mandatory)

Defence in depth [R]:

1. `saf approve <id>` can only be run by a person; it writes `art/approvals/<id>.json` with approver, date, checklist results and the SHA-256 of the exact files approved. The factory itself never writes this file.
2. `saf publish` and the CI test refuse any asset without a matching approval whose hash equals the shipped file's hash (changing the file invalidates the approval).
3. CI fails if the registry references an unapproved ID, an asset missing a licence record, or an asset over budget.
4. No workflow auto-merges artwork. Branch protection requiring a human review of any PR touching `public/art/` or `src/lib/art/` is recommended [U: repository settings were not inspected].
5. The generation step runs **only locally**. No scheduled job can create and ship art.

---

## 5. Proposed layout and runtime (summary; details in D)

```
sift-artwork/            (recommended: a separate repo; or art/ inside this one: decision Q3)
  manifest/assets.yml    what SIFT needs (IDs, surface, aspect, budget)
  templates/             prompt templates + sport tokens
  workflows/comfy/       ComfyUI API-format JSON, version-pinned
  tools/saf/             the CLI: plan, prompts, gen, post, sheet, approve, publish
  work/                  raw candidates (gitignored)
  masters/               approved lossless masters (LFS or release assets, see D §9)
  approvals/             one JSON per approved asset
  out/ ──────────────►   public/art/ + src/lib/art/registry.json (in the app repo)
```

Free CI (GitHub Actions) runs only: schema validation, licence-record checks, size budgets, approval checks, and the app's existing unit tests. It never generates.

---

## 6. Hardware, speed, setup, maintenance

| Topic | Finding |
|---|---|
| **Memory** | A guide reports 16 GB handles SDXL and FLUX schnell comfortably; FLUX dev swaps; 24 GB covers dev; under 16 GB ComfyUI runs but needs `--cpu-vae` [S]. An 8 GB M1 reportedly hits frequent out-of-memory on Draw Things [S]. The owner's Mac is unknown (Q1) |
| **Speed (indicative only)** | One promotional M4 Pro (24 GB) guide: ~10-15 s FLUX schnell 1024², ~15-20 s SDXL 1024², 3-5 s SD1.5 512² [S, treat as rough]. ComfyUI's mirrored docs: 2-4× slower than an equivalent NVIDIA GPU [S]. Fooocus README: M1/M2 ≈ 9× slower than an RTX 30-series [V]. ComfyUI has "the most flexibility but slowest on Mac" versus MLX and Draw Things [S] |
| **Workload** | For the first batch (document F): ~8 plate concepts × 2 aspects × ~6 candidates ≈ 100 generations. At 20-60 s each, **35 minutes to under 2 hours**, overnight-safe. The full library (~18 concepts × 3 crops × 6 candidates ≈ 330) is **2 to 6 hours** [R, arithmetic on indicative speeds] |
| **Setup complexity** | ComfyUI desktop app is the easiest route on macOS [V]; manual install needs a PyTorch **nightly** [V]. mflux is a Python package. Both need a model download on the owner's Mac (tens of GB total for two models) [U]. Half a day to first image is realistic; a full day to a scripted, pinned workflow [R] |
| **Maintenance** | Highest-churn component is the ComfyUI/PyTorch-nightly environment (verified dependency on nightlies [V]). Pin versions in a lockfile; keep the workflow JSON in git; record tool versions in every asset. Expect a few hours per quarter [R] |
| **Cost** | $0 recurring. One-time: the owner's existing Mac. Disk: model weights (tens of GB) plus masters |
| **Fragility** | A Mac sleeping mid-batch; use `caffeinate`. A model licence changing: licence hash is recorded and re-checked at each model update |

---

## 7. What can and cannot be automated: honest limits

* **Can:** everything in rows 1-3 and 5 (crops), 7-9 and 11; contact sheets; gross-failure rejection; reproducibility (seed + workflow JSON re-creates a candidate).
* **Cannot:** judging whether a plate looks premium or cheap; whether lighting is believable; whether a team-colour pairing is garish; whether a licence statement means what it says. These stay with a person.
* **Will not be solved by free tools:** premium action photography of named athletes; official crests and competition marks; Getty-grade crowds.
* **Risk of over-trust:** automated checks pass bland but useless images. The real-component render in step 10 (the plate *under the real text at the real size*) is the guard, and it is cheap.

---

## 8. Alternatives if local generation disappoints

Ranked by independence from AI [R]:

1. **Pure procedural** (CSS/SVG/Canvas). Already demonstrated in the PoC (A §8); zero licence risk; the floor of the whole system.
2. **Blender scenes**: scripted, deterministic, headless (`blender -b -P`), Metal-accelerated on Apple Silicon [V], native alpha, rights unambiguous. Stages are quick to model because they are surface + lights, not architecture. Best route to a *photographic-looking* plate without diffusion models.
3. **Photographic plates from CC0/CC BY sources** (empty arenas, floodlights), graded and layered, if the licence on each is verified at source (Commons or primary stock licence) and no people or marks are visible.
4. **Local diffusion** as a *texture and haze* generator only, under the section 2.2 licence rules, with every output run through section 4.1.

The factory is designed so that items 1-4 all produce the **same sidecar metadata and approval record**, so the choice of producer can change without changing the library.

---

## 9. Recommended spike (before any production art is made)

One working day on the owner's Mac, after the owner approves the strategy. Success criteria are measurable:

| # | Task | Pass criterion |
|---|---|---|
| S1 | Install ComfyUI desktop (or mflux) and FLUX.1 schnell; disable partner nodes; run the verified `/prompt` API from a script | 3 images produced by script with no manual clicks; time and peak RAM recorded |
| S2 | Generate 30 NFL-stage candidates (3 prompts × 10 seeds) at 1536 × 512 and 1080 × 1350 | median ≤ 90 s per image |
| S3 | Run section 4.1 checks over all 30 | 0 faces, 0 OCR hits in the **accepted** set; ≥ 1 candidate in 6 passes all automatic checks |
| S4 | Drop the 3 best into the real hero CSS at 1352 × 454 and 390 × 250 (a local, uncommitted branch) | text contrast ≥ 4.5 : 1 (small) / ≥ 3 : 1 (large) on the rendered background; owner says "approvable" for ≥ 1 |
| S5 | Blender: render an unbranded football on a transparent background, scripted | 1 PNG with alpha ≤ 120 KB at 800 px; reproducible from a script |
| S6 | Produce sidecar JSON and run `publish` into a throwaway folder; try to publish an unapproved asset | publish refuses |

If S2-S4 fail, fall back to alternatives 1-3; the library, approval flow and layer stack are unaffected.

---

## 10. Bottom line

SIFT can build a **free, repeatable, auditable, human-approved** artwork pipeline for everything that is not an identifiable person. The factory's value is less the diffusion model than the **manifest, metadata, gates and real-component review**, which also fix the rights hygiene problems found in document A. Generation is one swappable producer among four. The claim that it is "fully automated" would be wrong, and the claim that it can produce premium athlete imagery for free would be wrong too.
