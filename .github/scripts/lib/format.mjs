// Turning one API row into the cells a reader sees.
//
// Everything here is pure and clock-free — `now` is an argument — so the same
// listings always render the same table, which is what makes an hourly commit
// a diff of what CHANGED rather than a diff of when it ran.
//
// The input is a scrape of other people's job postings. Every string in it was
// written by someone outside this project, so nothing below interpolates one
// into HTML without escaping it, and nothing turns one into a link without
// first checking the scheme. A `javascript:` "apply" URL in a README is a
// supply-chain bug with a hyperlink on it.

import { placesOn } from './places.mjs';

/** HTML-escapes text bound for a table cell. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The URL, if it is one a link may point at, else null.
 *
 * http(s) only, and parsed rather than pattern-matched: `javascript:` survives
 * a surprising number of hand-written checks (tabs, newlines and comments are
 * all legal inside a scheme) and none of them survive `new URL`.
 */
export function safeUrl(value) {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Escapes text bound for MARKDOWN rather than for a table cell.
 *
 * A different job from `escapeHtml` and worth its own function: `&` is ordinary
 * text in Markdown and escaping it writes `&amp;` into a heading nobody asked
 * for, while `[`, `]` and `|` are the two characters that silently break a link
 * label and a table row. Escaping the wrong set is how "Semiconductors & chips"
 * ends up on a page as "Semiconductors &amp;amp; chips".
 */
export function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\\/g, '&#92;')
    .replace(/\|/g, '&#124;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/</g, '&lt;');
}

/** A link cell, or the plain escaped text when the URL is unusable. */
export function link(text, href) {
  const url = safeUrl(href);
  const label = escapeHtml(text);
  return url ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
}

const DAY_MS = 86_400_000;

/** Whole days between `iso` and `now`, or null when there is no usable date. */
export function ageInDays(iso, now) {
  if (typeof iso !== 'string' || iso === '') return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * The Age cell: `0d` … `29d`, then months.
 *
 * A listing with no date reads `—` rather than `0d`. "We don't know when this
 * was posted" and "this was posted today" are opposite facts about whether it
 * is worth opening, and the second one is the one that wastes an application.
 */
export function ageLabel(days) {
  if (days === null) return '—';
  if (days < 30) return `${days}d`;
  return `${Math.max(1, Math.floor(days / 30))}mo`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The Posted cell: an absolute date, or an honest dash.
 *
 * Absolute rather than relative on purpose, and for two reasons. A filter page
 * is a page somebody bookmarks, and `18 Sep` still means something a week later
 * where `2d` quietly means the wrong thing. And a relative age changes on EVERY
 * row EVERY day, so a list of 2,000 roles rewrites itself daily whether or not
 * a single posting moved — which is an hourly commit of pure noise, and a
 * repository that grows without anybody adding anything.
 */
export function postedLabel(iso) {
  if (typeof iso !== 'string' || iso === '') return '—';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '—';
  const when = new Date(at);
  return `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`;
}

/** Collapses whitespace and strips the site codes ATS exports leave behind. */
function tidyLocation(value) {
  return String(value ?? '')
    // "Mountain View (US-MTV-EMF680)" — an internal building code, never a place.
    .replace(/\s*\([A-Z0-9][A-Z0-9\s-]{3,}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    // `Cary,North Carolina,United States` is one real row: some exports leave no
    // space after the comma, and the cell reads as one long word on a phone.
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/** A key two spellings of one place share, so the cell lists it once. */
function locationKey(value) {
  return tidyLocation(value)
    .toLowerCase()
    .replace(/,?\s*(usa|u\.s\.a\.|united states|us)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * At most `limit` distinct locations, in the order the posting listed them.
 *
 * "Distinct" has to mean more than "a different string". One real row carries
 * the same office three times — `Mountain View, CA, USA`, `Mountain View
 * (US-MTV-EMF680)` and `Mountain View, CA, United States` — so an exact-match
 * set prints one place three times and calls it three locations. A key that is
 * a PREFIX of one already kept is the same place described more loosely, and
 * the more specific spelling is the one worth printing.
 */
function distinctLocations(values, limit) {
  const kept = [];
  for (const raw of values ?? []) {
    const tidy = tidyLocation(raw);
    if (!tidy) continue;
    const key = locationKey(tidy);
    if (!key) continue;
    const overlap = kept.findIndex((k) => k.key.startsWith(key) || key.startsWith(k.key));
    if (overlap !== -1) {
      // Same place, better words: "Mountain View, CA" beats "Mountain View".
      if (key.length > kept[overlap].key.length) kept[overlap] = { key, display: tidy };
      continue;
    }
    kept.push({ key, display: tidy });
    if (kept.length >= limit) break;
  }
  return kept.map((k) => k.display);
}

/** Countries worth printing: `Other` is the catalog's "somewhere we don't list". */
function namedCountries(job) {
  return (job.countries ?? []).filter((c) => c && c !== 'Other');
}

const MAX_LOCATIONS = 3;

/**
 * Does this DISPLAY string place the row on this metro's page?
 *
 * Only ever used to ORDER the cell, never to decide membership — which is why
 * it may be looser than `placesOn` without changing which page anything lands
 * on. The looseness it needs is one shape: a posting that writes its office as
 * `Bellevue, WA (Hybrid)` parses as the parts `Bellevue` and `WA (Hybrid)`, so
 * the state never matches and the string that earned the row its page reads as
 * placing nowhere. It was first in the cell by luck; a fourth-listed one would
 * not have been.
 */
function onThisPage(job, metroId, value) {
  if (placesOn(job, metroId, value)) return true;
  const bare = value.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return bare !== value && bare.length > 0 && placesOn(job, metroId, bare);
}


/**
 * The Location cell.
 *
 * Canonical cities first (the pipeline's own, already deduped), then the
 * posting's raw strings, then the country. A remote role says so first,
 * because "Remote" is the fact a reader scanning the column is looking for and
 * the city underneath it is usually just where the team sits.
 *
 * ── `metroId`, and why the cell has to know which page it is on ─────────────
 *
 * `metrosOf` reads EVERY location a row carries; this cell printed at most
 * three, chosen without reference to the page. So a row could be placed on the
 * Denver page by its Boulder office and print "Austin, TX" — and 126 of 625
 * rows on the internship metro pages did exactly that (218 of 2,496 on the
 * new-grad list), 21 of the 30 rows on `place/denver-boulder.md` among them. A
 * filter page whose rows name no city of that page reads as broken, and there
 * was nothing on the page to say otherwise.
 *
 * Two separate causes, which is why fixing the cap alone would not have done
 * it. The obvious one is the three-place cap. The bigger one was that
 * `job.cities` SHADOWED `job.locations` whenever it was non-empty, so a row
 * whose canonical city list held only "New York, NY" printed that on the Bay
 * Area page while "Menlo Park, CA" — the string that placed it there — sat in
 * `locations`, unconsulted, in a two-element list nothing had truncated.
 *
 * So the candidates are the UNION of both, and when the caller says which
 * metro's page this is, the places that earned the row its spot are sorted to
 * the front. The sort is STABLE, so a row already naming the right city prints
 * exactly the bytes it printed before. Passing no `metroId` — the README, the
 * field, role and company pages, where there is no metro to sort by — keeps
 * the posting's own order.
 */
export function locationLabel(job, metroId) {
  // Every piece is escaped BEFORE it is joined, never after: the `<br/>` this
  // cell puts between two offices is the one tag it means, and escaping the
  // finished string would print it. This was the one cell in the table that
  // interpolated a scraped string into HTML untouched — a posting whose
  // location closed the table and opened an `<h1>` rendered exactly that.
  const countries = namedCountries(job).map(escapeHtml);
  // The canonical cities first, then the posting's own strings — the union,
  // never one OR the other. `distinctLocations` already folds a looser
  // spelling into a more specific one, so "Austin, TX" in `cities` and
  // "Austin, TX, US" in `locations` still cost one slot.
  const candidates = distinctLocations([...(job.cities ?? []), ...(job.locations ?? [])], Infinity);
  const here = metroId ? candidates.filter((value) => onThisPage(job, metroId, value)) : [];

  if (job.remote === 'remote') {
    const scope = countries.length ? `Remote — ${countries.slice(0, MAX_LOCATIONS).join(', ')}` : 'Remote';
    // On a metro page, "Remote — United States" is true and answers the wrong
    // question: the row is on THIS page because the posting names an office
    // here, and without saying which, the filter looks like it fired at
    // random. Five rows read exactly that way. The country scope stays first —
    // "Remote" is still the fact a reader scanning the column wants — and the
    // office follows it.
    return here.length ? `${scope}<br/>${escapeHtml(here[0])}` : scope;
  }

  const ordered = here.length
    ? [...here, ...candidates.filter((value) => !here.includes(value))]
    : candidates;
  const places = ordered.slice(0, MAX_LOCATIONS).map(escapeHtml);
  if (!places.length) return countries.length ? countries.slice(0, MAX_LOCATIONS).join(', ') : '—';
  // A cap nobody can see is a cell that quietly claims to be the whole answer.
  const hidden = ordered.length - places.length;
  const label = places.join('<br/>') + (hidden > 0 ? `<br/>+${hidden} more` : '');
  // Only say "hybrid" if the posting has not already said it. A real row reads
  // `Hybrid (UK)`, and appending the classifier's own verdict to it produced
  // "Hybrid (UK) (hybrid)" — the kind of thing that makes a generated list look
  // generated.
  const suffix = job.remote === 'hybrid' && !/hybrid/i.test(label) ? ' (hybrid)' : '';
  return label + suffix;
}

/** How recent a role has to be to be worth a reader's eye at the top. */
export const NEW_DAYS = 3;

/**
 * The markers on a row, as one string.
 *
 * Only markers this data can actually fill. A legend that promises "🎓 advanced
 * degree required" over a column that is empty on every row of 2,000 teaches a
 * reader to stop reading the column.
 */
export function markers(job, days) {
  const marks = [];
  if (days !== null && days <= NEW_DAYS) marks.push('🆕');
  if (job.remote === 'remote') marks.push('🌐');
  if (job.sponsorship) marks.push('🛂');
  return marks.join(' ');
}
