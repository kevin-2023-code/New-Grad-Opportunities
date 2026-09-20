#!/usr/bin/env node
// Step 1 of the hourly run: read the catalog, write listings.json.
//
// Split from the rendering step on purpose. This one is the only thing that
// needs the network, so a rendering change can be developed and tested against
// the committed listings.json with no API call at all — and a run that fails
// here leaves both the data file and the READMEs exactly as they were.
//
// Usage: node .github/scripts/fetch.mjs [--base https://trueinterview.io]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_API_BASE, fetchAllJobs } from './lib/api.mjs';
import { dedupeByApplication, sortJobs } from './lib/select.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LISTINGS_PATH = join(HERE, 'listings.json');
const CONFIG_PATH = join(HERE, 'config.json');

/**
 * How far the list may shrink in one run before the read is treated as broken.
 *
 * Half is a wide door: these lists lose roles continuously as postings close,
 * and a real day's churn is a few per cent. What it stops is the shape of a
 * degraded read — thousands to a handful — which no legitimate hour produces.
 */
const COLLAPSE_FLOOR = 0.5;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const base = argValue('--base') ?? process.env.TRUEINTERVIEW_API_BASE ?? DEFAULT_API_BASE;

  console.log(`Reading ${base}/api/v1/jobs with ${JSON.stringify(config.query)}`);
  const { jobs, total, pages } = await fetchAllJobs(config.query, { base, log: (line) => console.log(line) });

  // Deduped and ordered HERE rather than at render time, so the committed data
  // file is the list itself and not a bag the renderer has to clean up. Two
  // consumers already read it: the renderer, and anyone who would rather have
  // the JSON than the table.
  const listings = sortJobs(dedupeByApplication(jobs));
  const allowCollapse = process.argv.includes('--allow-collapse');
  const dropped = jobs.length - listings.length;

  // A catalog-wide outage that answers 200 with an empty page would otherwise
  // wipe the committed list and read, to every visitor, as "there are no jobs".
  // A run that finds nothing where the last run found thousands is a failure
  // to investigate, not a list to publish.
  //
  // The floor is a COLLAPSE, not a zero. A degraded upstream — a search index
  // that answers 200 with a short page — comes back with a handful of rows
  // rather than none, and one row was enough to pass: the render then drops
  // every filter under its minimum and the pruner deletes their pages, so a
  // blip an hour long costs every link anybody had shared.
  const previous = await readFile(LISTINGS_PATH, 'utf8').then((raw) => JSON.parse(raw)).catch(() => null);
  const previousCount = previous?.listings?.length ?? 0;
  if (!allowCollapse && listings.length < previousCount * COLLAPSE_FLOOR) {
    throw new Error(
      `The API answered with ${listings.length} roles and the committed list holds ${previousCount} — ` +
        `below the ${Math.round(COLLAPSE_FLOOR * 100)}% floor. Refusing to publish a collapsed list; ` +
        'investigate the catalog, or pass --allow-collapse once the drop is known to be real.',
    );
  }

  // Nothing is written when the ROLES are identical to what is committed.
  //
  // This file used to carry the time of the read, so it changed on every run
  // whatever the catalog did — and the hourly workflow commits on `git diff
  // --quiet`, which saw that one line. Every no-op guard downstream
  // (`changedBeyondTimestamp`, `writeIfChanged`, the whole "a history where
  // most commits are the clock advancing cannot be read for what it is for"
  // argument) was defeated one step later by this file's own timestamp.
  //
  // So the stamp is `listingsChangedAt`, it is written only when the rows
  // actually moved, and it means what it says.
  const unchanged =
    previous !== null && JSON.stringify(previous.listings ?? []) === JSON.stringify(listings);
  if (unchanged) {
    console.log(
      `Read ${listings.length} listings (${pages} pages, ${total} reported by the API, ` +
        `${dropped} duplicate applications folded) — identical to the committed list, nothing written.`,
    );
    return;
  }

  await writeFile(
    LISTINGS_PATH,
    `${JSON.stringify(
      {
        // Every field a consumer needs to know what this file IS, before the
        // rows: which query produced it, when it last MOVED, and from where.
        source: `${base}/api/v1/jobs`,
        query: config.query,
        listingsChangedAt: new Date().toISOString(),
        count: listings.length,
        listings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`Wrote ${listings.length} listings (${pages} pages, ${total} reported by the API, ${dropped} duplicate applications folded).`);
}

main().catch((err) => {
  console.error(`fetch failed: ${err.message}`);
  process.exitCode = 1;
});
