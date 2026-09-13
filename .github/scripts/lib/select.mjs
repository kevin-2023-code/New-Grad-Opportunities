// Which rows go in which file, in which order, under which heading.
//
// Pure and clock-free like format.mjs: `now` travels in, nothing here reads a
// clock or the network. All of it is exercised by render.test.mjs.

import { ageInDays } from './format.mjs';

/**
 * The sections a list is cut into, in reading order.
 *
 * These are the catalog's own six technical fields, not a vocabulary invented
 * here — the API returns `family` from them, so a section can never hold a row
 * the board would file elsewhere. `Other` catches a row whose field is outside
 * the six, which is only reachable if the query is widened beyond `tech`.
 */
export const CATEGORIES = [
  { family: 'Software', emoji: '💻', title: 'Software Engineering' },
  { family: 'Data & AI', emoji: '🤖', title: 'Data, AI & Machine Learning' },
  { family: 'Hardware & Engineering', emoji: '🔧', title: 'Hardware & Engineering' },
  { family: 'Product & Design', emoji: '📱', title: 'Product & Design' },
  { family: 'Quantitative Finance', emoji: '📈', title: 'Quantitative Finance' },
  { family: 'IT & Support', emoji: '🧰', title: 'IT & Support' },
  { family: null, emoji: '💼', title: 'Other' },
];

/**
 * The GitHub anchor for a heading, so the index links at its own sections.
 *
 * GitHub's rule, transcribed: lowercase, drop everything that is not a letter,
 * digit, space, hyphen or underscore, then turn the spaces into hyphens. It
 * does NOT trim, which is why a heading that opens with an emoji anchors at a
 * LEADING hyphen (`#-software-engineering`) — the space the emoji leaves behind
 * becomes one. Trimming it here is the one-character mistake that makes every
 * link in the index scroll to the top of the page instead.
 */
export function anchorOf(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * One application, identified the way a reader would identify it.
 *
 * The API already returns one row per catalog id, but the catalog can hold the
 * same opening under two ids — a re-post, or two aggregators that reached it by
 * different URLs. Two rows pointing at the SAME application page are one
 * application to somebody filling it in, so the newer row wins and the older
 * one is dropped. Rows with no apply URL are never folded together: with
 * nothing to compare, "same company, similar title" is a guess, and a guess
 * that hides a real opening is the expensive direction to be wrong in.
 */
export function dedupeByApplication(jobs) {
  const byApplication = new Map();
  const kept = [];
  for (const job of jobs) {
    const key = job.applyUrl ? job.applyUrl.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase() : null;
    if (!key) {
      kept.push(job);
      continue;
    }
    const seen = byApplication.get(key);
    if (seen) continue;
    byApplication.set(key, job);
    kept.push(job);
  }
  return kept;
}

/** Newest first, then company, then title — a total order, so no two runs of
 *  the same data can produce two different files. */
export function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const at = Date.parse(a.updatedAt ?? '') || 0;
    const bt = Date.parse(b.updatedAt ?? '') || 0;
    if (at !== bt) return bt - at;
    const company = (a.company ?? '').localeCompare(b.company ?? '');
    if (company !== 0) return company;
    const title = (a.title ?? '').localeCompare(b.title ?? '');
    if (title !== 0) return title;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

/**
 * Splits the set into the home-region list and everything else.
 *
 * A row counts as home when the catalog resolved ANY of its countries into the
 * home set — a role open in both Toronto and London belongs in both readers'
 * lists, and printing it once in each is the honest answer.
 *
 * A row whose country could not be read at all goes to the GLOBAL file. That
 * is the fail-safe direction: the home file is the one most readers open, and
 * padding it with roles that might be anywhere is how a focused list stops
 * being one. The global file says which section they are in.
 */
export function splitByRegion(jobs, homeCountries) {
  const home = [];
  const elsewhere = [];
  for (const job of jobs) {
    const countries = job.countries ?? [];
    if (countries.some((c) => homeCountries.includes(c))) home.push(job);
    else elsewhere.push(job);
  }
  return { home, elsewhere };
}

/** True when the row named no country the catalog recognises. */
export function countryUnknown(job) {
  return !(job.countries ?? []).some((c) => c && c !== 'Other');
}

/**
 * Rows grouped into {@link CATEGORIES} order, dropping the empty sections.
 *
 * Every row lands in exactly one section: the `Other` entry has a null family
 * and takes whatever the six did not.
 */
export function groupByCategory(jobs) {
  const buckets = new Map(CATEGORIES.map((c) => [c.title, { ...c, jobs: [] }]));
  const fallback = buckets.get('Other');
  for (const job of jobs) {
    const match = CATEGORIES.find((c) => c.family && c.family === job.family);
    (match ? buckets.get(match.title) : fallback).jobs.push(job);
  }
  return [...buckets.values()].filter((bucket) => bucket.jobs.length > 0);
}

/**
 * Splits one section's rows into the table a reader sees and the fold below it.
 *
 * The cut is by AGE, not by count: a fold that opens on "the 51st role" tells a
 * reader nothing, while "posted in the last fortnight" is a fact they can use
 * to decide whether the rest is worth expanding. Roles with no date are in the
 * fold — an undated posting is not a recent one (the same rule the board's own
 * freshness window holds).
 */
export function splitByFreshness(jobs, featuredDays, now) {
  const featured = [];
  const older = [];
  for (const job of jobs) {
    const days = ageInDays(job.updatedAt, now);
    (days !== null && days <= featuredDays ? featured : older).push(job);
  }
  return { featured, older };
}
