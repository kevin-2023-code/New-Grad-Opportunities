#!/usr/bin/env node
// Step 2 of the hourly run: listings.json in, README.md + README-Global.md +
// the whole of `lists/` out.
//
// Reads no network and no clock of its own beyond `Date.now()` at the top, so
// it can be run against the committed data file while working on the layout:
//
//   node .github/scripts/render.mjs
//
// It rewrites only what is between the LISTINGS markers of the two READMEs, and
// it leaves a file alone entirely when nothing but the timestamp would change —
// see `changedBeyondTimestamp`. The filter pages under `lists/` are generated
// whole; a file there that this run did not produce is PRUNED, because a filter
// page nothing links to and nothing updates is worse than no page: it keeps
// answering, with roles that closed weeks ago.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import {
  PAGE_MAX_BYTES,
  README_MAX_BYTES,
  changedBeyondTimestamp,
  renderHub,
  renderListings,
  renderTrackPages,
  replaceBlock,
} from './lib/markdown.mjs';
import { anchorOf, countryUnknown, splitByRegion } from './lib/select.mjs';
import { companyLabel } from './lib/companies.mjs';
import { coverage } from './lib/segments.mjs';
import { NEW_THIS_WEEK_DAYS, buildTracks } from './lib/tracks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LISTS_DIR = 'lists';

/** How much of each README section is printed before the filter page takes over. */
const DEFAULT_CAPS = { featured: 25, fold: 50 };

/** The sentence under the legend saying where these rows came from. */
function sourceNote({ config, scope }) {
  const window = config.query.postedWithinDays
    ? `posted in the last ${config.query.postedWithinDays} days`
    : 'currently open';
  const scopeNote =
    scope === 'home'
      ? `Roles in ${config.homeLabel}.`
      : `Roles outside ${config.homeLabel}, and roles whose country the catalog could not read.`;
  return `${scopeNote} Pulled hourly from the TrueInterview job catalog — every role ${window} and still listed.`;
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

/** The README as it WOULD be, without writing it. Nothing is written until every
 *  budget below has been checked — a half-published run is the one state that
 *  cannot be recovered from by running it again. */
async function renderReadme(path, render) {
  const existing = await readFile(path, 'utf8');
  const next = replaceBlock(existing, render(backToTopOf(existing, path)));
  return { path, existing, next, changed: changedBeyondTimestamp(existing, next) };
}

/**
 * Writes a generated file only when something a READER would notice changed.
 *
 * The timestamp is excluded, the same way it is on the READMEs and for the same
 * reason: the hub carries one, so without this it would be rewritten and
 * committed every hour of every day whether or not a single role moved, and a
 * history where most commits are "the clock advanced" cannot be read for what
 * it is for.
 */
async function writeIfChanged(relative, contents) {
  const path = join(ROOT, relative);
  const existing = await readFile(path, 'utf8').catch(() => null);
  if (existing !== null && !changedBeyondTimestamp(existing, contents)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
  return true;
}

/**
 * Deletes every generated file under `lists/` this run did not produce.
 *
 * Scoped to that one directory BY CONSTRUCTION rather than by care: a filter
 * that empties (a metro with no roles this week, a role the catalog renamed)
 * must lose its page, and a pruner that could reach outside the directory it
 * generates is one bad path away from deleting the prose.
 */
async function prune(keep) {
  const removed = [];
  const walk = async (relative) => {
    const entries = await readdir(join(ROOT, relative), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(child);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md') || keep.has(child)) continue;
      await rm(join(ROOT, child));
      removed.push(child);
    }
  };
  await walk(LISTS_DIR);
  return removed;
}

/**
 * Every byte budget this repository promises, checked before anything is written.
 *
 * The budget is the product here. The new-grad README reached 554,638 bytes and
 * GitHub simply stopped drawing it a third of the way down — on a schedule, at
 * an hour nobody was watching, on the one file every visitor opens. So a run
 * that would publish an over-budget file fails instead: a list an hour stale is
 * recoverable, and a truncated one looks broken to everyone who arrives.
 */
function checkBudgets(files) {
  const problems = [];
  for (const [path, contents] of files) {
    const size = Buffer.byteLength(contents, 'utf8');
    const budget = path.includes('/') ? PAGE_MAX_BYTES : README_MAX_BYTES;
    if (size > budget) {
      problems.push(
        `${path} is ${size.toLocaleString('en-US')} bytes, over its ${budget.toLocaleString('en-US')}-byte budget ` +
          '(GitHub stops rendering a Markdown file at 512,000). Lower the per-section caps in config.json, or ROWS_PER_PAGE.',
      );
    }
  }
  return problems;
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
  const caps = { ...DEFAULT_CAPS, ...(config.readmeRowsPerSection ?? {}) };

  // One canonical display name per employer, resolved once. Without it the same
  // company is two companies to every count on every page: this snapshot alone
  // spells SpaceX two ways, and the registry would classify one of them.
  const listings = (data.listings ?? []).map((job) => ({ ...job, companyLabel: companyLabel(job.company) }));

  const { home, elsewhere } = splitByRegion(listings, config.homeCountries);
  console.log(
    `${listings.length} listings: ${home.length} in ${config.homeLabel}, ` +
      `${elsewhere.length} elsewhere (${elsewhere.filter(countryUnknown).length} with no country stated).`,
  );

  // Filters are built over the WHOLE set. A reader who has narrowed to "quant
  // trading" or "Machine Learning Engineer" has asked a question specific
  // enough that hiding the roles outside their region would be the surprise.
  const tracks = buildTracks(listings, { now });
  const fieldTracks = new Map(
    tracks.filter((track) => track.group === 'field').map((track) => [track.title, track]),
  );
  const cover = coverage(listings);
  console.log(
    `${tracks.length} filter pages; the company registry covers ` +
      `${cover.companiesClassified}/${cover.companies} employers and ${cover.rowsClassified}/${cover.rows} rows.`,
  );

  const generated = new Map();

  // ── the filter pages ──────────────────────────────────────────────────────
  const homeSet = new Set(home);
  for (const track of tracks) {
    const inHome = track.jobs.filter((job) => homeSet.has(job));
    const inElsewhere = track.jobs.filter((job) => !homeSet.has(job));
    const sections = [
      {
        title: config.homeLabel.replace(/^the /, ''),
        summary: `in ${config.homeLabel}`,
        jobs: inHome,
        note: '',
      },
      {
        title: 'Elsewhere in the world',
        summary: 'elsewhere in the world',
        jobs: inElsewhere,
        note: `Roles outside ${config.homeLabel}, and roles whose country the catalog could not read.`,
      },
    ].filter((section) => section.jobs.length);
    for (const [path, contents] of Object.entries(renderTrackPages(track, { now, sections }))) {
      generated.set(path, contents);
    }
  }
  generated.set(
    `${LISTS_DIR}/README.md`,
    renderHub({
      tracks,
      now,
      listName: config.listName,
      noun: config.noun,
      homeLabel: config.homeLabel,
      homePath: config.files.home,
      globalPath: config.files.global ?? null,
      coverageNote:
        `**What the company filters cover.** The sector and headcount of an employer are recorded in a ` +
        `hand-written registry, and it covers ${cover.companiesClassified.toLocaleString('en-US')} of the ` +
        `${cover.companies.toLocaleString('en-US')} employers on this list ` +
        (cover.rows
          ? `(${Math.round((100 * cover.rowsClassified) / cover.rows)}% of the roles). `
          : '. ') +
        `An employer it ` +
        `does not cover appears in the main list and in every field, role and location filter exactly as ` +
        `before — it is simply in no company-type filter, because guessing a sector from a company's name is ` +
        `how a reader ends up with the wrong list. ` +
        `[Add one](../CONTRIBUTING.md#adding-a-company-to-the-registry).`,
    }),
  );

  // ── the two READMEs ───────────────────────────────────────────────────────
  const readmes = [];
  for (const [scope, jobs] of [
    ['home', home],
    ['global', elsewhere],
  ]) {
    const path = join(ROOT, config.files[scope]);
    readmes.push(await renderReadme(path, (backToTop) =>
      renderListings({
        // The WHOLE region, uncapped. The per-section caps below are what keep
        // the file small, and they are applied after the counts are taken —
        // an input cap made the index say "Browse 1,500 roles" three lines
        // under a headline that said 2,336, and made a section header disagree
        // with the page it linked to.
        jobs,
        now,
        featuredDays: config.featuredDays,
        noun: config.noun,
        backToTop,
        freshDays: NEW_THIS_WEEK_DAYS,
        caps,
        tracks,
        scope: { rows: jobs, label: scope === 'home' ? config.homeLabel : 'the rest of the world' },
        fieldPathOf: (bucket) => {
          const track = fieldTracks.get(bucket.title);
          return track ? `${LISTS_DIR}/${track.path}.md` : null;
        },
        sourceNote: sourceNote({ config, scope }),
      }),
    ));
  }

  // ── budgets, then the writes ──────────────────────────────────────────────
  const problems = checkBudgets([
    ...readmes.map(({ path, next }) => [path.split('/').pop(), next]),
    ...generated,
  ]);
  if (problems.length) {
    throw new Error(`the rendered files are over budget:\n  - ${problems.join('\n  - ')}`);
  }

  const written = [];
  for (const readme of readmes) {
    if (!readme.changed) {
      console.log(`  ${readme.path}: unchanged`);
      continue;
    }
    await writeFile(readme.path, readme.next, 'utf8');
    console.log(`  ${readme.path}: rewritten`);
    written.push(readme.path.split('/').pop());
  }

  let changed = 0;
  for (const [path, contents] of generated) {
    if (await writeIfChanged(path, contents)) changed += 1;
  }
  const removed = await prune(new Set(generated.keys()));

  console.log(
    `${generated.size} filter pages (${changed} rewritten, ${removed.length} pruned).` +
      (removed.length ? ` Pruned: ${removed.join(', ')}` : ''),
  );
  console.log(written.length ? `Updated: ${written.join(', ')}` : 'The READMEs were already current.');
}

main().catch((err) => {
  console.error(`render failed: ${err.message}`);
  process.exitCode = 1;
});
