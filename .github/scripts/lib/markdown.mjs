// The renderer: listings in, one Markdown file out.
//
// Pure and clock-free (`now` is an argument), so the same input always produces
// the same bytes. That is what lets the workflow commit only when the LISTINGS
// changed rather than once an hour forever.
//
// Everything it writes goes between the two markers below. The prose above and
// below them is hand-written and is never touched, so a maintainer can rewrite
// the intro, add a banner or fix a typo without the next run reverting it.

import { ageInDays, ageLabel, escapeHtml, link, locationLabel, markers, safeUrl } from './format.mjs';
import { anchorOf, groupByCategory, splitByFreshness } from './select.mjs';

export const BLOCK_START = '<!-- LISTINGS:START — everything between these markers is generated hourly. Edit the scripts, not the table. -->';
export const BLOCK_END = '<!-- LISTINGS:END -->';

/** The line carrying the timestamp, matched so a re-render can tell a real
 *  change from a change of clock. */
const UPDATED_LINE = /^_Last updated:.*$/m;

/** One row. `↳` repeats the company above it, the way these lists always have. */
function row(job, now, previousCompany) {
  const days = ageInDays(job.updatedAt, now);
  const mark = markers(job, days);
  const company =
    job.company && job.company === previousCompany
      ? '↳'
      : `<strong>${escapeHtml(job.company || '—')}</strong>`;
  // The role links at the posting's own page on TrueInterview (`url`, which the
  // API answers with `/jobs/<id>`: one role, readable without an account, with
  // the ranking and tracking a click further in); the Apply cell links at the
  // employer's own form. Two links with two different jobs, rather than one
  // link that has to be both.
  //
  // That distinction is the whole reason the API grew a second URL. `url` used
  // to be the board deep link `/applications/jobs?role=<id>`, which is
  // account-only — so a reader clicking a role title here was answered with a
  // login page instead of the job, and one who was signed in got the whole
  // board, AI-ranked against their own CV, with this role pinned somewhere in
  // it. This file does not choose between them: it prints whatever `url` the
  // catalog published, which is why the fix reached these tables without a
  // change to the renderer.
  const role = `${link(job.title || 'Untitled role', job.url)}${mark ? ` ${mark}` : ''}`;
  const apply = safeUrl(job.applyUrl) ? link('Apply', job.applyUrl) : '—';
  return [
    '<tr>',
    `<td>${company}</td>`,
    `<td>${role}</td>`,
    `<td>${locationLabel(job)}</td>`,
    `<td align="center">${apply}</td>`,
    `<td align="center">${ageLabel(days)}</td>`,
    '</tr>',
  ].join('\n');
}

/** One table. Empty in means empty out — never a table with only a header. */
export function renderTable(jobs, now) {
  if (!jobs.length) return '';
  const rows = [];
  let previousCompany = null;
  for (const job of jobs) {
    rows.push(row(job, now, previousCompany));
    previousCompany = job.company;
  }
  return [
    '<table>',
    '<thead>',
    '<tr><th>Company</th><th>Role</th><th>Location</th><th align="center">Apply</th><th align="center">Age</th></tr>',
    '</thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
  ].join('\n');
}

/** One category: the fresh table, then the rest behind a fold. */
function renderSection(bucket, { now, featuredDays, backToTop }) {
  const heading = `${bucket.emoji} ${bucket.title}`;
  const { featured, older } = splitByFreshness(bucket.jobs, featuredDays, now);
  const parts = [`## ${heading}`, '', `[Back to top](#${backToTop})`, ''];

  if (featured.length) {
    parts.push(renderTable(featured, now), '');
  } else {
    parts.push(
      `_Nothing posted in the last ${featuredDays} days. The older roles below are still open._`,
      '',
    );
  }
  if (older.length) {
    parts.push(
      '<details>',
      `<summary>Show ${older.length} more ${bucket.title} ${older.length === 1 ? 'role' : 'roles'} posted earlier</summary>`,
      '',
      renderTable(older, now),
      '',
      '</details>',
      '',
    );
  }
  return parts.join('\n');
}

/** The "browse by category" index, with the counts a reader scans first. */
function renderIndex(buckets, total, noun) {
  const lines = [`### Browse ${total.toLocaleString('en-US')} ${noun} by category`, ''];
  for (const bucket of buckets) {
    const heading = `${bucket.emoji} ${bucket.title}`;
    lines.push(`${bucket.emoji} **[${bucket.title}](#${anchorOf(heading)})** (${bucket.jobs.length})`, '');
  }
  return lines.join('\n');
}

/**
 * The generated block: index, legend, then one section per category.
 *
 * `emptyNote` is not an edge case to tidy away. A list that renders nothing has
 * to say whether it found nothing or could not look, and this renderer is only
 * ever reached on a read that SUCCEEDED — the fetch step throws instead — so
 * "nothing matched" is the honest sentence here.
 */
export function renderListings({ jobs, now, featuredDays, noun, backToTop, sourceNote }) {
  const buckets = groupByCategory(jobs);
  // The timestamp lives INSIDE the block so this renderer owns it, and
  // `changedBeyondTimestamp` knows to ignore it when deciding whether a run
  // produced anything worth committing.
  const parts = [BLOCK_START, '', updatedLine(now), ''];

  if (!jobs.length) {
    parts.push(
      `_No ${noun} matched the filters on the last run. The catalog is refreshed continuously — check back within the hour._`,
      '',
      BLOCK_END,
    );
    return parts.join('\n');
  }

  parts.push(renderIndex(buckets, jobs.length, noun));
  parts.push(
    '---',
    '',
    '### Legend',
    '',
    `🆕 Posted in the last 3 days &nbsp;·&nbsp; 🌐 Remote &nbsp;·&nbsp; 🛂 The posting carries a work-authorisation restriction`,
    '',
    `_${sourceNote}_`,
    '',
    '---',
    '',
  );
  for (const bucket of buckets) {
    parts.push(renderSection(bucket, { now, featuredDays, backToTop }));
  }
  parts.push(BLOCK_END);
  return parts.join('\n');
}

/** Replaces the generated block in `existing`, keeping every hand-written line. */
export function replaceBlock(existing, block) {
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      'The listings markers are missing from the file. Restore BLOCK_START / BLOCK_END or delete the file and let the next run recreate it.',
    );
  }
  return existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length);
}

/**
 * Whether two renderings differ in anything a reader would notice.
 *
 * The timestamp is excluded on purpose. Without this the workflow would commit
 * every hour whether or not a single role had changed, and a history where
 * every commit is "the clock moved" cannot be read for what it is for — when
 * this employer posted, when that one pulled the role.
 */
export function changedBeyondTimestamp(before, after) {
  const strip = (text) => String(text ?? '').replace(UPDATED_LINE, '');
  return strip(before) !== strip(after);
}

/** The `_Last updated:_` line, in UTC so two runs never disagree by a timezone. */
export function updatedLine(now) {
  const iso = new Date(now).toISOString().replace('T', ' ').slice(0, 16);
  return `_Last updated: ${iso} UTC_`;
}
