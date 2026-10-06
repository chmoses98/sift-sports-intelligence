#!/usr/bin/env node
// Stadium media CLI (npm run stadiums -- <command>). Nothing here ever approves a photograph by itself.
//
//   validate                   venue manifest + photo registry + every served file (CI runs this through the unit tests)
//   audit                      the NFL venue audit table (markdown) from the manifest, the registry and the files
//   import [--venue <slug>]    owner-supplied originals in stadium-import/<venue-slug>/ -> CANDIDATES (owner review required)
//   approve <id> --by <name> --affirm-quality-bar
//                              promote a reviewed candidate: its files move into public/stadiums/ and it starts serving
//   reject <id> --reason <text>
//   legacy-mobile <id>         build the mobile derivative of a legacy photo from its committed desktop file
//                              (legacy Commons originals are not kept in the repository)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import {
  PATHS, QUALITY_BAR, ROOT, cropReport, deriveAll, fileSha256, fileWindow, imageSize, load, loadJson, suggestedDesktopFocusY, validatePhotos, validateVenues, venueForTeam,
} from './lib.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] ?? true : null;
};
const today = () => new Date().toISOString().slice(0, 10);

function savePhotos(photos) {
  const doc = loadJson(PATHS.photos);
  doc.photos = Object.fromEntries(Object.entries(photos).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(PATHS.photos, JSON.stringify(doc, null, 1) + '\n');
}

function validate() {
  const { venues, photos, targets } = load();
  const errors = validateVenues(venues);
  const r = validatePhotos(photos, venues, targets);
  errors.push(...r.errors);
  const served = existsSync(join(PATHS.public, 'stadiums')) ? readdirSync(join(PATHS.public, 'stadiums')).filter((f) => !f.startsWith('.')) : [];
  for (const f of served) if (!r.owned.has(`stadiums/${f}`)) errors.push(`public/stadiums/${f} has no approved photo record (no image without provenance)`);
  for (const f of r.findings) console.log(`finding  ${f}`);
  for (const e of errors) console.log(`ERROR    ${e}`);
  console.log(`\n${venues.length} venues, ${Object.keys(photos).length} photo assets, ${served.length} served files: ${errors.length} errors, ${r.findings.length} findings for owner review`);
  if (errors.length) process.exit(1);
}

// The 32 clubs, in the order the audit lists them (LA is the publication's alias for LAR).
const TEAMS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'];

function audit() {
  const { venues, photos, targets } = load();
  const date = arg('date') ?? today();
  const kb = (b) => `${Math.round(b / 1024)} KB`;
  const rows = [];
  for (const team of TEAMS) {
    const v = venueForTeam(venues, team, date);
    const p = v && Object.entries(photos).find(([, x]) => x.venue === v.slug && x.status === 'approved');
    const cand = v && Object.values(photos).some((x) => x.venue === v.slug && x.status === 'candidate');
    if (!v) { rows.push([team, '—', 'MISSING', '—', '—', '—', '—', '—', '—', '—', 'YES', 'No venue mapped']); continue; }
    if (!p) {
      rows.push([team, v.name, 'FALLBACK', 'Designed floodlit fallback', 'CSS artwork', '—', '—', '—', '—', '—', cand ? 'CANDIDATE AVAILABLE — OWNER REVIEW REQUIRED' : 'NEEDS OWNER-SUPPLIED ASSET', v.notes ?? '']);
      continue;
    }
    const [id, ph] = p;
    const cr = cropReport(ph, targets);
    const pct = (tid) => `${Math.round(cr.find((c) => c.id === tid).coverage * 100)}%`;
    const d = ph.files.desktop, m = ph.files.mobile;
    rows.push([
      team, v.name, ph.review?.audit_status ?? 'APPROVED REAL PHOTO', `${id} (${ph.captured.event ?? '—'})`, `Real photo · ${ph.captured.light}`,
      `${ph.source.kind === 'wikimedia-commons' ? 'Wikimedia Commons' : 'Owner'} — ${ph.source.author}`, ph.source.license,
      `orig ${ph.source.original.width}×${ph.source.original.height}; desktop ${d.width}×${d.height} ${kb(d.bytes)}; mobile ${m ? `${m.width}×${m.height} ${kb(m.bytes)}` : '—'}`,
      `${ph.review?.hero ?? '—'} (desktop keeps ${pct('hero-desktop')} of the architecture; suggested focus y ${suggestedDesktopFocusY(ph, targets)})`,
      `${ph.review?.mobile ?? '—'} (keeps ${pct('hero-mobile')})`, ph.review?.needs_replacement ?? '—', [ph.review?.notes, v.notes].filter(Boolean).join(' '),
    ]);
  }
  const head = ['TEAM', 'VENUE', 'VENUE / PHOTO STATUS', 'CURRENT ASSET', 'ASSET TYPE', 'SOURCE', 'LICENSE / RIGHTS', 'IMAGE DIMENSIONS', 'HERO QUALITY', 'MOBILE CROP QUALITY', 'NEEDS REPLACEMENT?', 'NOTES'];
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  console.log(`| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |`);
  for (const r of rows) console.log(`| ${r.map(esc).join(' | ')} |`);
}

/**
 * Owner-supplied import. Layout: stadium-import/<venue-slug>/<name>.(jpg|jpeg|png|tif|tiff|webp) with a
 * sidecar <name>.json holding the provenance (see stadium-import/README.md). Each valid pair becomes a
 * CANDIDATE: derivatives under curation/stadiums/candidates/ (never served), the original's sha256 and
 * size recorded, the original itself left where it is (it is not committed: licences differ).
 */
function importInbox() {
  const { venues, photos, targets } = load();
  const only = arg('venue');
  if (!existsSync(PATHS.inbox)) { console.log('stadium-import/ is empty'); return; }
  mkdirSync(PATHS.candidates, { recursive: true });
  let n = 0;
  const problems = [];
  for (const dir of readdirSync(PATHS.inbox, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    if (only && dir.name !== only) continue;
    for (const f of readdirSync(join(PATHS.inbox, dir.name)).filter((x) => /\.(jpe?g|png|tiff?|webp)$/i.test(x))) {
      const src = join(PATHS.inbox, dir.name, f);
      const at = `${dir.name}/${f}`;
      const sidecarPath = src.slice(0, -extname(src).length) + '.json';
      if (!existsSync(sidecarPath)) { problems.push(`${at}: no sidecar ${basename(sidecarPath)} (provenance is required)`); continue; }
      const meta = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
      const venue = venues.find((v) => v.slug === (meta.venue ?? dir.name));
      if (!venue) { problems.push(`${at}: unknown venue "${meta.venue ?? dir.name}" (use a slug from scripts/stadiums/venues.json)`); continue; }
      const missing = ['author', 'license', 'captured'].filter((k) => !meta[k]);
      if (missing.length) { problems.push(`${at}: sidecar is missing ${missing.join(', ')}`); continue; }
      const sha = fileSha256(src);
      const dup = Object.entries(photos).find(([, p]) => p.source?.original?.sha256 === sha);
      if (dup) { console.log(`skip ${at}: already registered as ${dup[0]}`); continue; }
      const size = imageSize(src);
      const aspect = size.width / size.height;
      const min = targets.source_min;
      if (size.width < min.width || size.height < min.height || aspect < min.aspect_min || aspect > min.aspect_max) {
        problems.push(`${at}: ${size.width}x${size.height} does not meet the source minimum (>= ${min.width}x${min.height}, landscape ${min.aspect_min}-${min.aspect_max})`);
        continue;
      }
      const id = meta.asset_id ?? (photos[venue.slug] ? `${venue.slug}--${meta.captured.light ?? 'alt'}${Object.keys(photos).filter((k) => k.startsWith(`${venue.slug}--`)).length || ''}` : venue.slug);
      const crop = { focus: meta.crop?.focus ?? { x: 0.5, y: 0.45 }, ...(meta.crop?.mobile_focus ? { mobile_focus: meta.crop.mobile_focus } : {}), ...(meta.crop?.card_focus ? { card_focus: meta.crop.card_focus } : {}), keep: meta.crop?.keep ?? { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.5 } };
      const d = deriveAll(src, { id, crop, grade: meta.grade ?? null, outDir: PATHS.candidates, relDir: 'curation/stadiums/candidates', targets });
      photos[id] = {
        venue: venue.slug,
        status: 'candidate',
        standard: 2,
        captured: { date: meta.captured.date ?? null, event: meta.captured.event ?? null, light: meta.captured.light ?? 'unknown', sky: meta.captured.sky ?? 'unknown', configuration: meta.captured.configuration ?? 'unknown' },
        source: {
          kind: 'owner-supplied', author: meta.author, rights_holder: meta.rights_holder ?? null, license: meta.license, license_url: meta.license_url ?? null, url: meta.source_url ?? null,
          original: { filename: f, ...d.original, retained_by: meta.original_retained_by ?? 'owner (not committed)' }, imported: today(),
        },
        transformations: d.transformations,
        crop,
        files: d.files,
        review: { notes: [meta.notes, meta.crop?.keep ? null : 'crop.keep was not supplied: a placeholder is set and MUST be drawn before approval'].filter(Boolean).join(' ') || null },
      };
      n++;
      const cr = cropReport(photos[id], targets).filter((c) => !c.ok);
      console.log(`candidate ${id} <- ${at} (${size.width}x${size.height}, ${meta.license})${cr.length ? `\n  crop: ${cr.map((c) => `${c.id} keeps ${Math.round(c.coverage * 100)}%`).join(', ')}` : ''}`);
    }
  }
  savePhotos(photos);
  for (const p of problems) console.log(`REJECTED ${p}`);
  console.log(`\n${n} candidate(s) registered — OWNER REVIEW REQUIRED before any is served (npm run stadiums -- approve <id> ...)`);
  if (problems.length) process.exitCode = 1;
}

function approve(id) {
  const { venues, photos, targets } = load();
  const p = photos[id];
  if (!p) throw new Error(`no photo ${id}`);
  if (p.status !== 'candidate') throw new Error(`${id} is ${p.status}; only a candidate can be approved`);
  const by = arg('by');
  if (!by || by === true) throw new Error('--by <owner name> is required');
  if (!rest.includes('--affirm-quality-bar')) throw new Error(`--affirm-quality-bar is required: the owner has checked ${QUALITY_BAR.join(', ')}`);
  const out = join(PATHS.public, 'stadiums');
  const files = {};
  for (const [f, d] of Object.entries(p.files)) {
    const name = basename(d.path);
    renameSync(join(ROOT, d.path), join(out, name));
    files[f] = { ...d, path: `stadiums/${name}` };
  }
  photos[id] = { ...p, status: 'approved', files, approval: { by, at: today(), quality_bar: Object.fromEntries(QUALITY_BAR.map((k) => [k, true])) } };
  const r = validatePhotos({ [id]: photos[id] }, venues, targets);
  if (r.errors.length) {
    for (const [f, d] of Object.entries(p.files)) renameSync(join(out, basename(d.path)), join(ROOT, d.path));
    throw new Error(`not approved:\n- ${r.errors.join('\n- ')}`);
  }
  savePhotos(photos);
  console.log(`approved ${id} for ${p.venue}; it is now served`);
}

function reject(id) {
  const { photos } = load();
  if (!photos[id]) throw new Error(`no photo ${id}`);
  const reason = arg('reason');
  if (!reason || reason === true) throw new Error('--reason is required');
  photos[id] = { ...photos[id], status: 'rejected', review: { ...(photos[id].review ?? {}), rejected: { at: today(), reason } } };
  savePhotos(photos);
  console.log(`rejected ${id}`);
}

function legacyMobile(id) {
  const { photos, targets } = load();
  const p = photos[id];
  if (!p?.files?.desktop) throw new Error(`${id} has no desktop file`);
  const src = join(PATHS.public, p.files.desktop.path);
  const { width, height } = imageSize(src);
  const win = fileWindow('mobile', width / height, p.crop, targets);
  const F = targets.files.mobile;
  const crop = `${Math.round((win.x1 - win.x0) * width)}x${Math.round((win.y1 - win.y0) * height)}+${Math.round(win.x0 * width)}+${Math.round(win.y0 * height)}`;
  const args = ['-crop', crop, '+repage', '-resize', `${F.max_width}x${F.max_height}>`, '-quality', String(F.quality)];
  const rel = `stadiums/${id}${F.suffix}.webp`;
  execFileSync('convert', [src, ...args, join(PATHS.public, rel)]);
  const sz = imageSize(join(PATHS.public, rel));
  p.files.mobile = { path: rel, width: sz.width, height: sz.height, bytes: readFileSync(join(PATHS.public, rel)).length, sha256: fileSha256(join(PATHS.public, rel)) };
  p.transformations = [...p.transformations.filter((t) => !t.startsWith('mobile:')), `mobile: convert ${p.files.desktop.path} ${args.join(' ')} -> ${rel} (a 3:4 crop of the graded desktop derivative; no further grade)`];
  savePhotos(photos);
  console.log(`${rel} ${sz.width}x${sz.height} ${Math.round(p.files.mobile.bytes / 1024)} KB`);
}

try {
  if (cmd === 'validate') validate();
  else if (cmd === 'audit') audit();
  else if (cmd === 'import') importInbox();
  else if (cmd === 'approve') approve(rest[0]);
  else if (cmd === 'reject') reject(rest[0]);
  else if (cmd === 'legacy-mobile') legacyMobile(rest[0]);
  else {
    console.log(readFileSync(new URL(import.meta.url), 'utf-8').split('\n').slice(1, 12).join('\n'));
    process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
