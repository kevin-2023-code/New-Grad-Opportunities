#!/usr/bin/env node
// Step 2 of the hourly run: listings.json in, README.md + README-Global.md out.
//
// Reads no network and no clock of its own beyond `Date.now()` at the top, so
// it can be run against the committed data file while working on the layout:
//
//   node .github/scripts/render.mjs
//
// It rewrites only what is between the LISTINGS markers, and it leaves a file
// alone entirely when nothing but the timestamp would change — see
// `changedBeyondTimestamp`.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { changedBeyondTimestamp, renderListings, replaceBlock } from './lib/markdown.mjs';
import { anchorOf, countryUnknown, splitByRegion } from './lib/select.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/** Caps one file's rows, newest kept. Returns the rows and what was left out. */
function cap(jobs, limit) {
  return limit > 0 && jobs.length > limit
    ? { jobs: jobs.slice(0, limit), omitted: jobs.length - limit }
    : { jobs, omitted: 0 };
}

/** The sentence under the legend saying where these rows came from. */
function sourceNote({ config, omitted, scope }) {
  const window = config.query.postedWithinDays
    ? `posted in the last ${config.query.postedWithinDays} days`
    : 'currently open';
  const scopeNote =
    scope === 'home'
      ? `Roles in ${config.homeLabel}.`
      : 'Roles outside ' + config.homeLabel + ', and roles whose country the catalog could not read.';
  const omittedNote = omitted
    ? ` ${omitted.toLocaleString('en-US')} older ${config.noun} are in listings.json but not in this table.`
    : '';
  return `${scopeNote} Pulled hourly from the TrueInterview job catalog — every role ${window} and still listed.${omittedNote}`;
}

/**
 * The file's own "back to top" anchor, read off its H1 rather than configured.
 *
 * The two files have different titles, so one configured anchor would be wrong
 * in one of them — and a "Back to top" link that silently does nothing is the
 * kind of defect nobody reports. Deriving it means renaming a title fixes every
 * link under it on the next run.
 */
function backToTopOf(markdown, path) {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  if (!heading) throw new Error(`${path} has no H1 for the section links to point back at.`);
  return anchorOf(heading[1].trim());
}

async function renderFile(path, render) {
  const existing = await readFile(path, 'utf8');
  const block = render(backToTopOf(existing, path));
  const next = replaceBlock(existing, block);
  if (!changedBeyondTimestamp(existing, next)) {
    console.log(`  ${path}: unchanged`);
    return false;
  }
  await writeFile(path, next, 'utf8');
  console.log(`  ${path}: rewritten`);
  return true;
}

async function main() {
  const config = JSON.parse(await readFile(join(HERE, 'config.json'), 'utf8'));
  const data = JSON.parse(await readFile(join(HERE, 'listings.json'), 'utf8'));
  // The scaffold committed with a fresh repository, before anything has read
  // the catalog. Rendering it would publish "nothing matched" — a statement
  // about the job market — over a file that has simply never been filled.
  if (!data.fetchedAt) {
    throw new Error('listings.json has never been filled. Run `node .github/scripts/fetch.mjs` first.');
  }
  const now = Date.now();

  const { home, elsewhere } = splitByRegion(data.listings ?? [], config.homeCountries);
  console.log(
    `${data.listings?.length ?? 0} listings: ${home.length} in ${config.homeLabel}, ` +
      `${elsewhere.length} elsewhere (${elsewhere.filter(countryUnknown).length} with no country stated).`,
  );

  const written = [];
  for (const [scope, jobs] of [
    ['home', home],
    ['global', elsewhere],
  ]) {
    const capped = cap(jobs, config.maxRowsPerFile);
    const written_ = await renderFile(join(ROOT, config.files[scope]), (backToTop) =>
      renderListings({
        jobs: capped.jobs,
        now,
        featuredDays: config.featuredDays,
        noun: config.noun,
        backToTop,
        sourceNote: sourceNote({ config, omitted: capped.omitted, scope }),
      }),
    );
    if (written_) written.push(config.files[scope]);
  }

  console.log(written.length ? `Updated: ${written.join(', ')}` : 'Nothing changed.');
}

main().catch((err) => {
  console.error(`render failed: ${err.message}`);
  process.exitCode = 1;
});
