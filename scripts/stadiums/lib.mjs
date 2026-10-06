// The stadium media system's shared core: the canonical venue manifest (venues.json), the photo asset
// registry with provenance (photos.json), the crop targets (crop-targets.json), crop geometry, the
// validation rules and the ImageMagick derivations. Used by cli.mjs, fetch.mjs and the unit tests
// (tests/stadiums.test.ts); the app reads the same JSON through src/lib/venues.ts.
//
// Geometry is in NORMALISED SOURCE coordinates: (0,0) is the photograph's top-left, (1,1) its
// bottom-right. A focus {x, y} has CSS object-position semantics (x = 0.5 is "center"), so it maps to
// `object-position: x% y%` with no conversion.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const PATHS = {
  venues: join(ROOT, 'scripts', 'stadiums', 'venues.json'),
  photos: join(ROOT, 'scripts', 'stadiums', 'photos.json'),
  targets: join(ROOT, 'scripts', 'stadiums', 'crop-targets.json'),
  public: join(ROOT, 'public'),
  candidates: join(ROOT, 'curation', 'stadiums', 'candidates'),
  inbox: join(ROOT, 'stadium-import'),
};

export const ROOFS = ['outdoor', 'dome', 'retractable'];
export const KINDS = ['nfl', 'neutral'];
export const PHOTO_STATUS = ['approved', 'candidate', 'rejected', 'retired'];
export const LIGHTS = ['day', 'night', 'indoor', 'unknown'];
export const SKIES = ['clear', 'cloud', 'rain', 'snow', 'none', 'unknown'];
/** What the owner affirms, item by item, when approving a photograph (owner spec 9). */
export const QUALITY_BAR = [
  'correct_venue', 'current_venue', 'no_watermark', 'desktop_resolution', 'works_behind_ui', 'architecture_recognizable_after_crop',
  'not_misleading_construction_state', 'no_ai_artifacts', 'no_fake_signage', 'correct_scoreboard', 'correct_seating_bowl', 'correct_surroundings',
];

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}
export function load() {
  return { venues: loadJson(PATHS.venues).venues, photos: loadJson(PATHS.photos).photos, targets: loadJson(PATHS.targets) };
}

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** [from, to) overlap of two ISO date windows (null = open). */
export function overlaps(a, b) {
  const aFrom = a?.from ?? '0000', aTo = a?.to ?? '9999', bFrom = b?.from ?? '0000', bTo = b?.to ?? '9999';
  return aFrom < bTo && bFrom < aTo;
}

// ------------------------------------------------------------------ geometry

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** The part of the source a derived file contains. */
export function fileWindow(file, srcAspect, crop, targets) {
  if (file === 'desktop') return { x0: 0, y0: 0, x1: 1, y1: 1 };
  const spec = targets.files[file];
  const aspect = file === 'card' ? spec.width / spec.height : spec.aspect;
  const f = (file === 'mobile' ? crop.mobile_focus : crop.card_focus) ?? crop.focus;
  if (srcAspect > aspect) {
    const w = aspect / srcAspect;
    const x0 = clamp01(f.x) * (1 - w);
    return { x0, y0: 0, x1: x0 + w, y1: 1 };
  }
  const h = srcAspect / aspect;
  const y0 = clamp01(f.y) * (1 - h);
  return { x0: 0, y0, x1: 1, y1: y0 + h };
}

/** Where a derived file is positioned in its box (CSS object-position, 0..1). */
export function displayFocus(file, crop) {
  if (file === 'mobile') return { x: 0.5, y: (crop.mobile_focus ?? crop.focus).y };
  return crop.focus;
}

/** The part of the source visible when `win` is drawn with object-fit: cover in a box of `boxAspect`. */
export function visibleRect(win, srcAspect, boxAspect, pos) {
  const ww = win.x1 - win.x0, wh = win.y1 - win.y0;
  const winAspect = (srcAspect * ww) / wh;
  if (boxAspect >= winAspect) {
    const v = winAspect / boxAspect; // share of the window's height that shows
    const y0 = win.y0 + clamp01(pos.y) * (1 - v) * wh;
    return { x0: win.x0, y0, x1: win.x1, y1: y0 + v * wh };
  }
  const v = boxAspect / winAspect;
  const x0 = win.x0 + clamp01(pos.x) * (1 - v) * ww;
  return { x0, y0: win.y0, x1: x0 + v * ww, y1: win.y1 };
}

export function coverage(keep, rect) {
  const w = Math.max(0, Math.min(keep.x1, rect.x1) - Math.max(keep.x0, rect.x0));
  const h = Math.max(0, Math.min(keep.y1, rect.y1) - Math.max(keep.y0, rect.y0));
  const area = (keep.x1 - keep.x0) * (keep.y1 - keep.y0);
  return area > 0 ? (w * h) / area : 0;
}

/**
 * The smallest share of crop.keep that stays visible in a target across its aspect range. Within each
 * fit regime the visible rectangle shrinks monotonically, so the two range ends bound it.
 */
export function targetCoverage(target, srcAspect, crop, targets) {
  const win = fileWindow(target.file, srcAspect, crop, targets);
  const pos = displayFocus(target.file, crop);
  return Math.min(...target.aspect.map((a) => coverage(crop.keep, visibleRect(win, srcAspect, a, pos))));
}

/** Every target's coverage for one photo: [{ id, coverage, required, ok }]. */
export function cropReport(photo, targets) {
  const srcAspect = photo.source.original.width / photo.source.original.height;
  return targets.targets.map((t) => {
    const c = targetCoverage(t, srcAspect, photo.crop, targets);
    return { id: t.id, coverage: Math.round(c * 1000) / 1000, required: t.keep_min, ok: c >= t.keep_min - 1e-6 };
  });
}

/** The desktop focus y that centres crop.keep in the narrowest desktop hero band (a suggestion for review). */
export function suggestedDesktopFocusY(photo, targets) {
  const t = targets.targets.find((x) => x.id === 'hero-desktop');
  const srcAspect = photo.source.original.width / photo.source.original.height;
  const v = Math.min(1, srcAspect / Math.max(...t.aspect));
  if (v >= 1) return photo.crop.focus.y;
  const centre = (photo.crop.keep.y0 + photo.crop.keep.y1) / 2;
  return Math.round(clamp01((centre - v / 2) / (1 - v)) * 100) / 100;
}

// ------------------------------------------------------------------ venue resolution (mirrors src/lib/venues.ts)

export function activeOn(window, date) {
  if (!date) return true;
  const d = date.slice(0, 10);
  return (!window?.from || window.from <= d) && (!window?.to || d < window.to);
}

/** The venue a published name means on a date: aliases resolve, a name shared over time is split by date. */
export function venueByName(venues, name, date) {
  const n = norm(name);
  if (!n) return null;
  const hits = venues.filter((v) => norm(v.name) === n || (v.aliases ?? []).some((a) => norm(a) === n));
  return hits.find((v) => activeOn(v.in_service, date)) ?? (hits.length === 1 ? hits[0] : null);
}

export function venueForTeam(venues, team, date) {
  return venues.find((v) => (v.tenancies ?? []).some((t) => t.team === team && activeOn(t, date))) ?? null;
}

// ------------------------------------------------------------------ validation

const isRect = (r) => r && [r.x0, r.y0, r.x1, r.y1].every((n) => typeof n === 'number' && n >= 0 && n <= 1) && r.x0 < r.x1 && r.y0 < r.y1;
const isFocus = (f) => f && [f.x, f.y].every((n) => typeof n === 'number' && n >= 0 && n <= 1);
const isDate = (s) => s == null || /^\d{4}-\d{2}-\d{2}$/.test(s);

export function validateVenues(venues) {
  const errors = [];
  const slugs = new Set();
  for (const v of venues) {
    const at = `venue ${v.slug ?? '?'}`;
    if (!v.slug || !/^[a-z0-9-]+$/.test(v.slug)) errors.push(`${at}: slug must be kebab-case`);
    if (slugs.has(v.slug)) errors.push(`${at}: duplicate slug (one entry per physical venue)`);
    slugs.add(v.slug);
    if (!v.name || !v.city || !v.country) errors.push(`${at}: name, city and country are required`);
    if (!ROOFS.includes(v.roof)) errors.push(`${at}: roof must be one of ${ROOFS.join('/')}`);
    if (!KINDS.includes(v.kind)) errors.push(`${at}: kind must be one of ${KINDS.join('/')}`);
    if (typeof v.lat !== 'number' || typeof v.lon !== 'number' || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) errors.push(`${at}: lat/lon required`);
    if (!isDate(v.in_service?.from) || !isDate(v.in_service?.to)) errors.push(`${at}: in_service dates must be YYYY-MM-DD`);
    if (v.kind === 'neutral' && (v.tenancies ?? []).length) errors.push(`${at}: a neutral site has no tenants`);
    if (v.kind === 'nfl' && !(v.tenancies ?? []).length) errors.push(`${at}: an NFL home venue needs a tenancy`);
    for (const t of v.tenancies ?? []) {
      if (!t.team || !isDate(t.from) || !isDate(t.to)) errors.push(`${at}: tenancy needs team and YYYY-MM-DD dates`);
      if (v.in_service && (t.from < (v.in_service.from ?? '0000') || (t.to ?? '9999') > (v.in_service.to ?? '9999'))) errors.push(`${at}: ${t.team} tenancy falls outside in_service`);
    }
  }
  // A name may belong to two venues only if they were never in service at the same time.
  const byName = new Map();
  for (const v of venues) for (const n of [v.name, ...(v.aliases ?? [])]) {
    const k = norm(n);
    for (const other of byName.get(k) ?? []) if (other !== v && overlaps(other.in_service, v.in_service)) errors.push(`name "${n}" is ambiguous: ${other.slug} and ${v.slug} were in service at the same time`);
    byName.set(k, [...(byName.get(k) ?? []).filter((o) => o !== v), v]);
  }
  // A team plays at one home venue at a time.
  const tenancies = venues.flatMap((v) => (v.tenancies ?? []).map((t) => ({ ...t, venue: v.slug })));
  for (const [i, a] of tenancies.entries()) for (const b of tenancies.slice(i + 1)) {
    if (a.team === b.team && a.venue !== b.venue && overlaps(a, b)) errors.push(`team ${a.team} has overlapping home tenancies at ${a.venue} and ${b.venue}`);
  }
  return errors;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
/** Pixel size of a WebP from its header (no ImageMagick needed), else via `identify`. */
export function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}
export function imageSize(path) {
  if (path.endsWith('.webp')) {
    const s = webpSize(readFileSync(path));
    if (s) return s;
  }
  const [w, h] = execFileSync('identify', ['-format', '%w %h\n', path]).toString().trim().split('\n')[0].split(' ').map(Number);
  return { width: w, height: h };
}

/**
 * Photo registry rules. errors block (CI fails); findings are reported for owner review.
 * checkFiles reads the derived files and compares their dimensions and sha256 with the record.
 */
export function validatePhotos(photos, venues, targets, { checkFiles = true, publicDir = PATHS.public, root = ROOT } = {}) {
  const errors = [];
  const findings = [];
  const venueSlugs = new Set(venues.map((v) => v.slug));
  for (const [id, p] of Object.entries(photos)) {
    const at = `photo ${id}`;
    if (!/^[a-z0-9-]+$/.test(id)) errors.push(`${at}: id must be kebab-case (it names the files)`);
    if (!venueSlugs.has(p.venue)) errors.push(`${at}: unknown venue ${p.venue}`);
    if (!PHOTO_STATUS.includes(p.status)) errors.push(`${at}: status must be one of ${PHOTO_STATUS.join('/')}`);
    const s = p.source ?? {};
    if (!['wikimedia-commons', 'owner-supplied'].includes(s.kind)) errors.push(`${at}: source.kind must be wikimedia-commons or owner-supplied`);
    // A Commons file proposed for review, not fetched yet: fetch.mjs fills in its provenance and files.
    if (p.status === 'candidate' && s.kind === 'wikimedia-commons' && !p.files) {
      if (!s.file) errors.push(`${at}: a proposed Commons photo needs source.file`);
      if (!isFocus(p.crop?.focus) || !isRect(p.crop?.keep)) errors.push(`${at}: crop needs focus {x,y} and keep {x0,y0,x1,y1} in 0..1`);
      findings.push(`${at}: proposed Commons file awaiting fetch (stadium-images workflow)`);
      continue;
    }
    // Provenance: answerable for every asset, whatever its status.
    if (!s.author) errors.push(`${at}: source.author (photographer / author) is required`);
    if (!s.license) errors.push(`${at}: source.license is required`);
    if (s.kind === 'wikimedia-commons' && (!s.file || !s.url || !s.license_url)) errors.push(`${at}: a Commons photo needs source.file, source.url and source.license_url`);
    if (s.kind === 'owner-supplied' && !s.original?.sha256) errors.push(`${at}: an owner-supplied photo needs the original's sha256`);
    if (!(s.original?.width > 0 && s.original?.height > 0)) errors.push(`${at}: source.original width/height are required`);
    if (!Array.isArray(p.transformations) || !p.transformations.length) errors.push(`${at}: transformations must list every change made to the original`);
    if (!isFocus(p.crop?.focus) || (p.crop?.mobile_focus && !isFocus(p.crop.mobile_focus)) || !isRect(p.crop?.keep)) errors.push(`${at}: crop needs focus {x,y} and keep {x0,y0,x1,y1} in 0..1`);
    if (!LIGHTS.includes(p.captured?.light) || !SKIES.includes(p.captured?.sky)) errors.push(`${at}: captured.light / captured.sky must be set (${LIGHTS.join('/')} ; ${SKIES.join('/')})`);
    const venue = venues.find((v) => v.slug === p.venue);
    if (venue && venue.roof === 'dome' && p.captured?.light !== 'indoor' && p.captured?.light !== 'unknown') errors.push(`${at}: ${venue.slug} has a fixed roof; captured.light must be indoor`);
    if (p.status === 'approved') {
      if (!p.approval?.by || !isDate(p.approval?.at)) errors.push(`${at}: an approved photo records who approved it and when (approval.by / approval.at)`);
      if (p.standard === 2 && !QUALITY_BAR.every((k) => p.approval?.quality_bar?.[k] === true)) errors.push(`${at}: standard-2 approval must affirm every quality-bar item`);
      for (const f of Object.keys(targets.files)) {
        const d = p.files?.[f];
        if (!d?.path || !d.width || !d.height || !d.bytes || !d.sha256) { errors.push(`${at}: approved photo is missing its ${f} file record`); continue; }
        if (!d.path.startsWith('stadiums/')) errors.push(`${at}: ${f} must be served from public/stadiums/`);
        if (!checkFiles) continue;
        const full = join(publicDir, d.path);
        if (!existsSync(full)) { errors.push(`${at}: ${d.path} does not exist`); continue; }
        if (sha256(full) !== d.sha256) errors.push(`${at}: ${d.path} does not match its recorded sha256`);
        const sz = imageSize(full);
        if (sz.width !== d.width || sz.height !== d.height) errors.push(`${at}: ${d.path} is ${sz.width}x${sz.height}, recorded ${d.width}x${d.height}`);
      }
    } else if (p.files) {
      for (const d of Object.values(p.files)) if (d?.path?.startsWith('stadiums/')) errors.push(`${at}: a ${p.status} photo must not ship in public/stadiums (${d.path})`);
      if (checkFiles) for (const d of Object.values(p.files)) if (d?.path && !existsSync(join(root, d.path))) errors.push(`${at}: ${d.path} does not exist`);
    }
    // Crops: blocking for photos approved under this standard, reported for legacy approvals and candidates.
    if (isRect(p.crop?.keep) && isFocus(p.crop?.focus) && s.original?.width) {
      for (const r of cropReport(p, targets)) {
        if (r.ok) continue;
        const msg = `${at}: ${r.id} keeps ${Math.round(r.coverage * 100)}% of the identifying architecture (needs ${Math.round(r.required * 100)}%)`;
        if (p.status === 'approved' && p.standard === 2) errors.push(msg);
        else findings.push(msg);
      }
    }
    if (p.status === 'approved' && p.standard !== 2) findings.push(`${at}: approved under the earlier bar (standard ${p.standard ?? 1}); re-review against owner spec 9`);
  }
  // One served image per file: nothing in public/stadiums without an approved owner.
  const owned = new Set(Object.values(photos).filter((p) => p.status === 'approved').flatMap((p) => Object.values(p.files ?? {}).map((d) => d.path)));
  return { errors, findings, owned };
}

// ------------------------------------------------------------------ derivation (ImageMagick)

/** The restrained colour grade used for the legacy Commons heroes (opt-in per photo). */
export function gradeArgs(g) {
  if (!g) return [];
  const x = { brightness: 100, saturation: 112, contrast: 3, ...g };
  return ['-unsharp', '0x28+0.32+0.02', '-sigmoidal-contrast', `${x.contrast}x48%`, '-modulate', `${x.brightness},${x.saturation},100`];
}

/**
 * Make the three derivatives of one ORIGINAL photograph. Never alters geometry beyond crop + resize.
 * Returns { files: {desktop, mobile, card} (paths relative to outRoot), transformations: [...] }.
 */
export function deriveAll(src, { id, crop, grade, outDir, relDir, targets }) {
  const { width, height } = imageSize(src);
  const srcAspect = width / height;
  const g = gradeArgs(grade);
  const F = targets.files;
  const out = (f) => join(outDir, `${id}${F[f].suffix}.webp`);
  const px = (win) => `${Math.round((win.x1 - win.x0) * width)}x${Math.round((win.y1 - win.y0) * height)}+${Math.round(win.x0 * width)}+${Math.round(win.y0 * height)}`;
  const common = ['-auto-orient', '-strip'];
  const mWin = fileWindow('mobile', srcAspect, crop, targets);
  const cWin = fileWindow('card', srcAspect, crop, targets);
  const steps = {
    desktop: [...common, '-resize', `${F.desktop.max_width}x${F.desktop.max_height}>`, ...g, '-quality', String(F.desktop.quality)],
    mobile: [...common, '-crop', px(mWin), '+repage', '-resize', `${F.mobile.max_width}x${F.mobile.max_height}>`, ...g, '-quality', String(F.mobile.quality)],
    card: [...common, '-crop', px(cWin), '+repage', '-resize', `${F.card.width}x${F.card.height}!`, ...g, '-quality', String(F.card.quality)],
  };
  const files = {};
  const transformations = [];
  for (const [f, args] of Object.entries(steps)) {
    execFileSync('convert', [src, ...args, out(f)]);
    const sz = imageSize(out(f));
    files[f] = { path: `${relDir}/${id}${F[f].suffix}.webp`, width: sz.width, height: sz.height, bytes: readFileSync(out(f)).length, sha256: sha256(out(f)) };
    transformations.push(`${f}: convert <original> ${args.join(' ')} -> ${files[f].path}`);
  }
  if (!g.length) transformations.push('no colour grade (geometry: crop + resize only)');
  return { files, transformations, original: { width, height, sha256: sha256(src), bytes: readFileSync(src).length } };
}

export { sha256 as fileSha256 };
