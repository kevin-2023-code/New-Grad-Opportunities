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
  const dropped = jobs.length - listings.length;

  // A catalog-wide outage that answers 200 with an empty page would otherwise
  // wipe the committed list and read, to every visitor, as "there are no jobs".
  // A run that finds nothing where the last run found thousands is a failure
  // to investigate, not a list to publish.
  const previous = await readFile(LISTINGS_PATH, 'utf8').then((raw) => JSON.parse(raw)).catch(() => null);
  const previousCount = previous?.listings?.length ?? 0;
  if (!listings.length && previousCount > 0) {
    throw new Error(`The API answered with no roles at all, and the committed list holds ${previousCount}. Refusing to publish an empty list.`);
  }

  await writeFile(
    LISTINGS_PATH,
    `${JSON.stringify(
      {
        // Every field a consumer needs to know what this file IS, before the
        // rows: which query produced it, when, and from where.
        source: `${base}/api/v1/jobs`,
        query: config.query,
        fetchedAt: new Date().toISOString(),
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
