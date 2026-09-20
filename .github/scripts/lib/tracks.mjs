// The filters: every cut of the list that gets a page of its own.
//
// The README is organised by the catalog's six technical FIELDS, which is the
// right first cut and the wrong only one. The three questions a candidate
// actually arrives with are "who is hiring — big tech, fintech, a mid-sized
// company?", "which role?" and "where?", and none of those is a field. So each
// one becomes a track: a filter with a page, a count, and a sentence saying
// exactly what it selects.
//
// Every track is built from a fact already on the row or in the company
// registry. None is a curated list of roles somebody liked, which is what makes
// the whole set reproducible: run the generator twice on the same snapshot and
// the same roles are on the same pages.
//
// ── The rules ────────────────────────────────────────────────────────────────
//
//   * **A track states its rule.** `note` is printed on the page and on the
//     hub. "Big Tech" is a defensible cut only while the page says it means a
//     technology-sector employer with 10,000+ people; without that it is an
//     opinion with a table under it.
//   * **A track is never the only way to a row.** Every row is in the README
//     and its field section whatever the filters do, so a row the registry
//     could not classify loses nothing.
//   * **Small tracks do not get a page.** A filter that holds three roles is
//     churn: it appears for an hour, disappears, and every link to it breaks.
//     `MIN_TRACK_ROWS` is where that line is.

import {
  BIG_TECH,
  LARGE_TECH,
  MID_TECH,
  SECTORS,
  STARTUP_TECH,
  inSizeCut,
  segmentOf,
} from './segments.mjs';
import { METROS, metrosOf } from './places.mjs';
import { CATEGORIES } from './select.mjs';
import { ageInDays } from './format.mjs';

/** Below this, a filter is churn rather than a page. */
export const MIN_TRACK_ROWS = 5;

/** How recent "new this week" is. */
export const NEW_THIS_WEEK_DAYS = 7;

/** The groups, in the order the hub and the README index print them. */
export const TRACK_GROUPS = [
  {
    id: 'field',
    emoji: '🗂️',
    title: 'By field',
    blurb: "The catalog's six technical fields — the same sections the main list is cut into, with every row rather than a sample.",
  },
  {
    id: 'company',
    emoji: '🏷️',
    title: 'By company type',
    blurb: 'Who the employer is: the size cut you were after, or the sector.',
  },
  { id: 'role', emoji: '🧑‍💻', title: 'By role', blurb: "The catalog's own role classification, not a keyword search on the title." },
  { id: 'place', emoji: '📍', title: 'By location', blurb: 'Metro areas the postings actually resolve to.' },
  { id: 'quick', emoji: '⚡', title: 'Quick filters', blurb: 'The two cuts that are about the posting rather than the employer.' },
];

const SIZE_CUTS = [
  {
    id: 'big-tech', emoji: '🏛️', title: 'Big Tech', cut: BIG_TECH,
    blurb: 'The giants: 10,000+ people, in a technology sector.',
  },
  {
    id: 'large-tech', emoji: '🏗️', title: 'Large tech (1,000–9,999)', cut: LARGE_TECH,
    blurb: 'Established technology companies past the startup stage and short of the giants.',
  },
  {
    id: 'mid-size-tech', emoji: '🏤', title: 'Mid-sized tech (200–999)', cut: MID_TECH,
    blurb: 'Big enough to have a real engineering org, small enough that you will meet the founders.',
  },
  {
    id: 'startups', emoji: '🌱', title: 'Startups (under 200)', cut: STARTUP_TECH,
    blurb: 'Early-stage technology companies.',
  },
];

/** The kebab-case file name for a value that came out of the catalog. */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Every track, with its rows, in hub order.
 *
 * `jobs` is the WHOLE set — both regions — because a filter page is the one
 * place a reader has asked a question narrow enough that the answer is worth
 * showing wherever it is. The page itself separates the two regions.
 */
export function buildTracks(jobs, { now, minRows = MIN_TRACK_ROWS } = {}) {
  const segments = new Map();
  const segmentFor = (job) => {
    const company = job.company ?? '';
    if (!segments.has(company)) segments.set(company, segmentOf(company));
    return segments.get(company);
  };

  const tracks = [];
  const push = (track) => {
    if (track.jobs.length >= minRows) tracks.push(track);
  };

  // ── by field ──────────────────────────────────────────────────────────────
  // The same six sections the README is organised into, as pages that carry
  // every row. The README shows a sample of each and links here for the rest,
  // which is what keeps it under the byte limit GitHub stops rendering at.
  for (const category of CATEGORIES) {
    const rows = category.family
      ? jobs.filter((job) => job.family === category.family)
      : jobs.filter((job) => !CATEGORIES.some((other) => other.family && other.family === job.family));
    push({
      id: `field-${slugify(category.title)}`,
      path: `field/${slugify(category.title)}`,
      group: 'field',
      emoji: category.emoji,
      title: category.title,
      blurb: '',
      note:
        `Every posting the catalog classified into the ${category.family ?? 'unrecognised'} field. ` +
        'A posting is in exactly one field, so these six pages hold the whole list between them.',
      // What the HUB prints. The same rule with the name taken out, so a table
      // of six of these says it once rather than six times — the page itself
      // still names the field, where naming it is the point.
      rule:
        'Every posting the catalog classified into that field. A posting is in exactly one field, ' +
        'so these pages hold the whole list between them.',
      jobs: rows,
    });
  }

  // ── by company type ───────────────────────────────────────────────────────
  for (const size of SIZE_CUTS) {
    push({
      id: size.id,
      path: `company/${size.id}`,
      group: 'company',
      emoji: size.emoji,
      title: size.title,
      blurb: size.blurb,
      note:
        'A derived cut, not a hand-picked list: the employer is in one of the technology sectors ' +
        `and the registry records its headcount as ${describeSizes(size.cut.sizes)}. An employer ` +
        'the registry does not cover is in no size cut at all.',
      jobs: jobs.filter((job) => inSizeCut(segmentFor(job), size.cut)),
    });
  }
  for (const sector of SECTORS) {
    push({
      id: sector.id,
      path: `company/${sector.id}`,
      group: 'company',
      emoji: sector.emoji,
      title: sector.label,
      blurb: sector.blurb,
      note:
        `Every employer the company registry files under ${sector.label}, at any size. ` +
        'The sector is a fact about the company recorded once, never inferred from a job title.',
      jobs: jobs.filter((job) => segmentFor(job).sector === sector.id),
    });
  }

  // ── by role ───────────────────────────────────────────────────────────────
  // Built from whatever roles this snapshot actually holds rather than a fixed
  // list, so a role the catalog adds tomorrow gets a page without a code change
  // — and one that empties loses its page instead of pointing at nothing.
  const byRole = new Map();
  for (const job of jobs) {
    const role = (job.role ?? '').trim();
    if (!role || role === 'Other') continue;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(job);
  }
  const roles = [...byRole.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [role, rows] of roles) {
    push({
      id: `role-${slugify(role)}`,
      path: `role/${slugify(role)}`,
      group: 'role',
      emoji: '•',
      title: role,
      blurb: '',
      note:
        `Every posting the catalog classified as ${role}. Roles it could not place are filed as ` +
        '*Other* and appear on no role page — they are in the README and every other cut.',
      rule:
        'Every posting the catalog classified as that role. A posting it could not place is filed ' +
        'as *Other* and is on no role page — it is in the README and in every other cut.',
      jobs: rows,
    });
  }

  // ── by location ───────────────────────────────────────────────────────────
  const metroHits = new Map(METROS.map((metro) => [metro.id, []]));
  for (const job of jobs) {
    for (const id of metrosOf(job)) metroHits.get(id)?.push(job);
  }
  for (const metro of METROS) {
    push({
      id: `place-${metro.id}`,
      path: `place/${metro.id}`,
      group: 'place',
      emoji: metro.emoji,
      title: metro.label,
      blurb: '',
      note:
        'A posting is on this page when its location resolves to a city in this metro AND the ' +
        'row’s country agrees. A posting whose location could not be read is on no location page.',
      jobs: metroHits.get(metro.id) ?? [],
    });
  }

  // ── quick filters ─────────────────────────────────────────────────────────
  push({
    id: 'remote',
    path: 'remote',
    group: 'quick',
    emoji: '🌐',
    title: 'Remote',
    blurb: 'Postings the pipeline classified as remote.',
    note:
      'The catalog’s own work-mode classification, not a keyword match on the title. Hybrid ' +
      'postings are not here — they are a different answer to "must I move?".',
    jobs: jobs.filter((job) => job.remote === 'remote'),
  });
  push({
    id: 'new-this-week',
    path: 'new-this-week',
    group: 'quick',
    emoji: '🆕',
    title: 'Posted in the last 7 days',
    blurb: 'Everything the employers put up this week.',
    note:
      `Published or re-posted within ${NEW_THIS_WEEK_DAYS} days of the last run. A posting with no ` +
      'date is not here: undated is not recent.',
    jobs: jobs.filter((job) => {
      const days = ageInDays(job.updatedAt, now);
      return days !== null && days <= NEW_THIS_WEEK_DAYS;
    }),
  });

  return tracks;
}

function describeSizes(sizes) {
  if (sizes.includes('mega')) return '10,000 people or more';
  if (sizes.includes('large')) return 'between 1,000 and 9,999 people';
  if (sizes.includes('mid')) return 'between 200 and 999 people';
  return 'fewer than 200 people';
}

/** Tracks grouped in `TRACK_GROUPS` order, dropping the groups with nothing in them. */
export function groupTracks(tracks) {
  return TRACK_GROUPS.map((group) => ({
    ...group,
    tracks: tracks.filter((track) => track.group === group.id),
  })).filter((group) => group.tracks.length > 0);
}
