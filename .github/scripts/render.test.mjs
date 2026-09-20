// The generator's tests. `node --test .github/scripts/`
//
// They run in CI before any run is allowed to rewrite the published list,
// because the two failures that matter here are both silent: a renderer that
// drops rows still produces a plausible-looking table, and an index whose
// anchors have drifted still produces links that simply do nothing.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ageLabel, escapeHtml, locationLabel, markers, safeUrl } from './lib/format.mjs';
import {
  anchorOf,
  CATEGORIES,
  countryUnknown,
  dedupeByApplication,
  groupByCategory,
  sortJobs,
  splitByFreshness,
  splitByRegion,
} from './lib/select.mjs';
import {
  BLOCK_END,
  BLOCK_START,
  changedBeyondTimestamp,
  renderListings,
  renderTable,
  replaceBlock,
} from './lib/markdown.mjs';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

function job(over = {}) {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    company: 'Acme',
    title: 'Software Engineer',
    locations: ['Seattle, WA'],
    cities: ['Seattle, WA'],
    countries: ['United States'],
    remote: 'onsite',
    category: 'Software',
    family: 'Software',
    role: 'Software Engineer',
    seniority: 'new-grad',
    level: 'newgrad',
    kind: 'newgrad',
    sponsorship: null,
    source: '1point3acres',
    applyUrl: 'https://jobs.example.com/1',
    url: 'https://trueinterview.io/jobs/1',
    postedAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...over,
  };
}

describe('cells', () => {
  it('escapes text a posting controls', () => {
    assert.equal(escapeHtml('<script>&"'), '&lt;script&gt;&amp;&quot;');
  });

  it('refuses a URL that is not http(s), however it is spelled', () => {
    assert.equal(safeUrl('https://x.test/a'), 'https://x.test/a');
    assert.equal(safeUrl('javascript:alert(1)'), null);
    // A scheme may legally carry whitespace and control characters, which is
    // what defeats a hand-written prefix check; parsing does not care.
    assert.equal(safeUrl('java\nscript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,<script>'), null);
    assert.equal(safeUrl(''), null);
    assert.equal(safeUrl(undefined), null);
  });

  it('renders an unlinkable apply URL as a dash rather than a dead link', () => {
    const table = renderTable([job({ applyUrl: 'javascript:alert(1)' })], NOW);
    assert.ok(!table.includes('javascript:'));
    assert.ok(table.includes('<td align="center">—</td>'));
  });

  it('says nothing about the age of an undated posting', () => {
    assert.equal(ageLabel(null), '—');
    assert.equal(ageLabel(0), '0d');
    assert.equal(ageLabel(29), '29d');
    assert.equal(ageLabel(30), '1mo');
    assert.equal(ageLabel(213), '7mo');
  });

  it('leads with Remote, and names the countries it is remote in', () => {
    assert.equal(
      locationLabel(job({ remote: 'remote', countries: ['United States', 'Canada'], cities: [] })),
      'Remote — United States, Canada',
    );
    assert.equal(locationLabel(job({ remote: 'remote', countries: ['Other'], cities: [] })), 'Remote');
  });

  it('prefers canonical cities, then the posting, then the country', () => {
    assert.equal(locationLabel(job({ cities: ['Mountain View, CA'] })), 'Mountain View, CA');
    assert.equal(
      locationLabel(job({ cities: [], locations: ['Milano, Italy'], countries: ['Other'] })),
      'Milano, Italy',
    );
    assert.equal(locationLabel(job({ cities: [], locations: [], countries: ['Japan'] })), 'Japan');
    assert.equal(locationLabel(job({ cities: [], locations: [], countries: [] })), '—');
  });

  it('prints one place once, whichever way the ATS spelled it', () => {
    // A real row: the same office three times, one of them as a building code.
    const label = locationLabel(
      job({
        cities: [],
        locations: ['Mountain View, CA, USA', 'Mountain View (US-MTV-EMF680)', 'Mountain View, CA, United States'],
      }),
    );
    assert.equal(label, 'Mountain View, CA, USA');
  });

  it('does not say "hybrid" twice when the posting already said it once', () => {
    assert.equal(
      locationLabel(job({ remote: 'hybrid', cities: [], locations: ['Hybrid (UK)'], countries: ['United Kingdom'] })),
      'Hybrid (UK)',
    );
    assert.equal(
      locationLabel(job({ remote: 'hybrid', cities: ['Dublin'], countries: ['Ireland'] })),
      'Dublin (hybrid)',
    );
  });

  it('marks only what the row can actually evidence', () => {
    assert.equal(markers(job(), 1), '🆕');
    assert.equal(markers(job({ remote: 'remote' }), 30), '🌐');
    assert.equal(markers(job({ sponsorship: 'U.S. Citizenship is Required' }), 30), '🛂');
    assert.equal(markers(job(), null), '');
  });
});

describe('selection', () => {
  it('anchors a heading the way GitHub does, leading hyphen and all', () => {
    assert.equal(anchorOf('💻 Software Engineering'), '-software-engineering');
    assert.equal(anchorOf('🤖 Data, AI & Machine Learning'), '-data-ai--machine-learning');
  });

  it('folds two rows that lead to the same application form', () => {
    const kept = dedupeByApplication([
      job({ id: 'a', applyUrl: 'https://jobs.example.com/1?utm_source=x' }),
      job({ id: 'b', applyUrl: 'https://jobs.example.com/1/' }),
      job({ id: 'c', applyUrl: 'https://jobs.example.com/2' }),
    ]);
    assert.deepEqual(kept.map((j) => j.id), ['a', 'c']);
  });

  it('never folds rows that have no application URL to compare', () => {
    const kept = dedupeByApplication([
      job({ id: 'a', applyUrl: null }),
      job({ id: 'b', applyUrl: null }),
    ]);
    assert.equal(kept.length, 2);
  });

  it('orders newest first, and totally — the same input cannot render two ways', () => {
    const rows = [
      job({ id: 'b', company: 'Beta', updatedAt: daysAgo(1) }),
      job({ id: 'a', company: 'Alpha', updatedAt: daysAgo(1) }),
      job({ id: 'c', company: 'Gamma', updatedAt: daysAgo(0) }),
    ];
    assert.deepEqual(sortJobs(rows).map((j) => j.id), ['c', 'a', 'b']);
    assert.deepEqual(sortJobs([...rows].reverse()).map((j) => j.id), ['c', 'a', 'b']);
  });

  it('puts a role open in two regions in both lists', () => {
    const { home, elsewhere } = splitByRegion(
      [job({ id: 'both', countries: ['Canada', 'United Kingdom'] })],
      ['United States', 'Canada'],
    );
    assert.equal(home.length, 1);
    assert.equal(elsewhere.length, 0);
  });

  it('sends a role with no country to the global list, not the home one', () => {
    const rows = [job({ id: 'nowhere', countries: [] }), job({ id: 'other', countries: ['Other'] })];
    const { home, elsewhere } = splitByRegion(rows, ['United States', 'Canada']);
    assert.equal(home.length, 0);
    assert.equal(elsewhere.length, 2);
    assert.ok(countryUnknown(rows[0]));
    assert.ok(countryUnknown(rows[1]));
  });

  it('keeps the category order, and catches a field outside the six', () => {
    const buckets = groupByCategory([
      job({ family: 'Quantitative Finance' }),
      job({ family: 'Software' }),
      job({ family: 'Healthcare' }),
    ]);
    assert.deepEqual(buckets.map((b) => b.title), ['Software Engineering', 'Quantitative Finance', 'Other']);
  });

  it('drops the sections nothing landed in', () => {
    assert.deepEqual(groupByCategory([job()]).map((b) => b.title), ['Software Engineering']);
    assert.deepEqual(groupByCategory([]), []);
  });

  it('folds an undated posting away with the old ones', () => {
    const { featured, older } = splitByFreshness(
      [job({ id: 'fresh', updatedAt: daysAgo(2) }), job({ id: 'stale', updatedAt: daysAgo(40) }), job({ id: 'undated', updatedAt: null })],
      14,
      NOW,
    );
    assert.deepEqual(featured.map((j) => j.id), ['fresh']);
    assert.deepEqual(older.map((j) => j.id), ['stale', 'undated']);
  });
});

describe('the table', () => {
  it('repeats a company as ↳ and names it again when it changes', () => {
    const table = renderTable(
      [job({ company: 'Acme' }), job({ company: 'Acme' }), job({ company: 'Globex' })],
      NOW,
    );
    assert.equal(table.match(/<strong>Acme<\/strong>/g).length, 1);
    assert.equal(table.match(/<td>↳<\/td>/g).length, 1);
    assert.ok(table.includes('<strong>Globex</strong>'));
  });

  it('escapes a hostile title instead of rendering it', () => {
    const table = renderTable([job({ title: 'SWE <img src=x onerror=alert(1)>' })], NOW);
    assert.ok(!table.includes('<img'));
    assert.ok(table.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  it('renders nothing at all for no rows, rather than an empty table', () => {
    assert.equal(renderTable([], NOW), '');
  });
});

describe('the page', () => {
  const rendered = () =>
    renderListings({
      jobs: [
        job({ id: '1', company: 'Acme', updatedAt: daysAgo(1) }),
        job({ id: '2', company: 'Globex', family: 'Data & AI', updatedAt: daysAgo(40) }),
      ],
      now: NOW,
      featuredDays: 14,
      noun: 'new-grad roles',
      backToTop: 'new-grad-opportunities',
      sourceNote: 'Roles in the United States & Canada.',
    });

  it('links its index at anchors the headings actually have', () => {
    const page = rendered();
    const headings = [...page.matchAll(/^## (.+)$/gm)].map((m) => anchorOf(m[1]));
    const links = [...page.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    const sectionLinks = links.filter((l) => l !== 'new-grad-opportunities');
    assert.ok(sectionLinks.length > 0);
    for (const target of sectionLinks) assert.ok(headings.includes(target), `#${target} is not a heading`);
  });

  it('puts an older role behind a fold rather than dropping it', () => {
    const page = rendered();
    assert.ok(page.includes('<details>'));
    assert.ok(page.includes('Globex'));
  });

  it('says the list is empty rather than rendering an empty page', () => {
    const page = renderListings({
      jobs: [],
      now: NOW,
      featuredDays: 14,
      noun: 'new-grad roles',
      backToTop: 'x',
      sourceNote: 'note',
    });
    assert.ok(page.includes('No new-grad roles matched'));
    assert.ok(page.startsWith(BLOCK_START));
    assert.ok(page.trimEnd().endsWith(BLOCK_END));
  });

  it('describes every legend marker it can render, and none it cannot', () => {
    const page = rendered();
    for (const mark of ['🆕', '🌐', '🛂']) assert.ok(page.includes(mark), `${mark} is unexplained`);
    // The markers a hand-maintained list carries and this data cannot fill.
    for (const mark of ['🔒', '🎓', '🔥']) assert.ok(!page.includes(mark), `${mark} is promised and never filled`);
  });
});

describe('writing the file', () => {
  const file = `# Title\n\nIntro a human wrote.\n\n${BLOCK_START}\nold\n${BLOCK_END}\n\nFooter a human wrote.\n`;

  it('replaces only what is between the markers', () => {
    const next = replaceBlock(file, `${BLOCK_START}\nnew\n${BLOCK_END}`);
    assert.ok(next.includes('Intro a human wrote.'));
    assert.ok(next.includes('Footer a human wrote.'));
    assert.ok(next.includes('new'));
    assert.ok(!next.includes('old'));
  });

  it('refuses a file whose markers are gone, rather than appending a second list', () => {
    assert.throws(() => replaceBlock('# Title\n\nno markers\n', 'block'), /markers are missing/);
  });

  it('does not count a new timestamp as a change', () => {
    const before = `x\n_Last updated: 2026-09-13 11:00 UTC_\ny`;
    const after = `x\n_Last updated: 2026-09-13 12:00 UTC_\ny`;
    assert.equal(changedBeyondTimestamp(before, after), false);
    assert.equal(changedBeyondTimestamp(before, `${after}\nAcme`), true);
  });
});

describe('the category list', () => {
  it('covers the six technical fields the query asks for, plus a catch-all', () => {
    const families = CATEGORIES.map((c) => c.family);
    for (const family of [
      'Software',
      'Data & AI',
      'Hardware & Engineering',
      'Product & Design',
      'Quantitative Finance',
      'IT & Support',
    ]) {
      assert.ok(families.includes(family), `${family} has no section`);
    }
    assert.equal(families.filter((f) => f === null).length, 1);
  });
});

// ── what the filters added ───────────────────────────────────────────────────
//
// The four failures below are the ones worth a test, because every one of them
// produces a page that looks right: an employer split in two by its spelling, a
// New Jersey town filed under the Bay Area, a filter counted over the whole
// world under a heading that says one region, and a README that renders fine
// locally and stops halfway down on GitHub.

import { companyKey, companyLabel } from './lib/companies.mjs';
import { COMPANY_SEGMENTS } from './lib/company-registry.mjs';
import { SECTORS, SIZES, coverage, inSizeCut, segmentOf } from './lib/segments.mjs';
import { METROS, metrosOf, readLocation } from './lib/places.mjs';
import { MIN_TRACK_ROWS, buildTracks, groupTracks, slugify } from './lib/tracks.mjs';
import { PAGE_MAX_BYTES, README_MAX_BYTES, renderFilters, renderHub, renderTrackPages } from './lib/markdown.mjs';
import { escapeMarkdown, postedLabel } from './lib/format.mjs';

describe('one employer, one name', () => {
  it('collapses the spellings one employer reaches the catalog under', () => {
    assert.equal(companyLabel('Spacex'), 'SpaceX');
    assert.equal(companyLabel('SpaceX'), 'SpaceX');
    assert.equal(companyKey('Spacex'), companyKey('SpaceX'));
    assert.equal(companyKey('Openai'), 'openai');
  });

  it('leaves a name the catalog stored as authored exactly as it was written', () => {
    assert.equal(companyLabel('Susquehanna International Group'), 'Susquehanna International Group');
    assert.equal(companyLabel('Ci&t'), 'Ci&t');
    assert.equal(companyKey('Ci&t'), 'ci-and-t');
  });

  it('title-cases only the names that arrived with no casing at all', () => {
    assert.equal(companyLabel('applied intuition'), 'applied intuition');
    assert.equal(companyLabel('applied-intuition'), 'Applied Intuition');
    assert.equal(companyLabel(''), '');
  });
});

describe('the company registry', () => {
  it('answers for a company it has never heard of, without guessing', () => {
    assert.deepEqual(segmentOf('Zzz Definitely Not A Real Employer'), { sector: null, size: null });
    assert.deepEqual(segmentOf(''), { sector: null, size: null });
  });

  it('is keyed on the slug every other surface files a company under', () => {
    // A registry key that is not what `companyKey` produces is an entry that
    // will never be found, and nothing anywhere would report it.
    for (const key of Object.keys(COMPANY_SEGMENTS)) {
      assert.equal(companyKey(key), key, `${key} is not a canonical company key`);
    }
  });

  it('only ever records a sector and a size the taxonomy defines', () => {
    const sectors = new Set(SECTORS.map((sector) => sector.id));
    const sizes = new Set(SIZES.map((size) => size.id));
    for (const [key, entry] of Object.entries(COMPANY_SEGMENTS)) {
      assert.ok(entry.sector === null || sectors.has(entry.sector), `${key}: unknown sector ${entry.sector}`);
      assert.ok(entry.size === null || sizes.has(entry.size), `${key}: unknown size ${entry.size}`);
    }
  });

  it('takes a size cut over technology sectors only', () => {
    const cut = { id: 'big-tech', sizes: ['mega'] };
    assert.equal(inSizeCut({ sector: 'consumer-internet', size: 'mega' }, cut), true);
    // A 10,000-person employer that is not a technology company: big, not Big Tech.
    assert.equal(inSizeCut({ sector: 'engineering-services', size: 'mega' }, cut), false);
    // An employer whose headcount nobody could establish is in no size cut.
    assert.equal(inSizeCut({ sector: 'consumer-internet', size: null }, cut), false);
    assert.equal(inSizeCut({ sector: null, size: 'mega' }, cut), false);
  });

  it('reports how much of a set it actually covers', () => {
    const rows = [job({ company: 'Google' }), job({ company: 'Zzz Not Real Ltd' })];
    const cover = coverage(rows);
    assert.equal(cover.rows, 2);
    assert.equal(cover.companies, 2);
    assert.ok(cover.companiesClassified <= cover.companies);
  });
});

describe('placing a posting', () => {
  const at = (locations, countries = ['United States']) => job({ cities: [], locations, countries });

  const statesOf = (value) => new Set(readLocation(value).states.map((entry) => entry.code));

  it('reads a state out of every spelling an ATS exports', () => {
    assert.ok(statesOf('US,CA,San Jose').has('CA'));
    assert.ok(statesOf('Santa Clara, CA, US').has('CA'));
    assert.ok(statesOf('Spring, Texas, United States of America').has('TX'));
    assert.ok(statesOf('Washington, DC').has('DC'));
    // `Washington` alone is the city in DC far more often than the state, and
    // reading it as WA would put the capital in Puget Sound.
    assert.ok(!statesOf('Washington, DC').has('WA'));
  });

  it('resolves the country on the string that named the city', () => {
    // One location supplied the country and another the city, so a row open in
    // Paris (France) and Paris, TX put the Texas one on the France page.
    const bothParises = { countries: ['United States', 'France'], cities: [], locations: ['Paris, TX'] };
    assert.deepEqual(metrosOf(bothParises), []);
    assert.deepEqual(metrosOf({ countries: ['France'], cities: [], locations: ['Paris, France'] }), ['france']);
    // A bare city on a row that names ONE country is still placeable.
    assert.deepEqual(metrosOf({ countries: ['France'], cities: [], locations: ['Paris'] }), ['france']);
  });

  it('does not let a state name stand in for the city of the same name', () => {
    assert.deepEqual(metrosOf(at(['Malta, New York'])), []);
    assert.deepEqual(metrosOf(at(['New York, NY'])), ['new-york']);
    assert.deepEqual(metrosOf(at(['New York, New York'])), ['new-york']);
  });

  it('refuses a building that merely starts with a city name', () => {
    // A Californian shelter called the Bristol Hotel was published under
    // London & the UK.
    assert.deepEqual(metrosOf(at(['Bristol Hotel Emergency Shelter office'])), []);
    assert.deepEqual(metrosOf(at(['San Francisco Office'])), ['bay-area']);
  });

  it('refuses the city name that is in two states', () => {
    assert.deepEqual(metrosOf(at(['Newark, NJ'])), ['new-york']);
    assert.deepEqual(metrosOf(at(['Newark, CA'])), ['bay-area']);
    assert.deepEqual(metrosOf(at(['Berkeley Heights, NJ'])), []);
  });

  it('keeps Cambridge, MA out of the London list and vice versa', () => {
    assert.deepEqual(metrosOf(at(['Cambridge, MA'])), ['boston']);
    assert.deepEqual(metrosOf(at(['Cambridge'], ['United Kingdom'])), ['uk']);
  });

  it('places nothing when the country could not be resolved', () => {
    assert.deepEqual(metrosOf(at(['San Francisco'], [])), []);
    assert.deepEqual(metrosOf(at(['San Francisco'], ['Other'])), []);
    assert.deepEqual(metrosOf(at(['San Francisco'])), ['bay-area']);
  });

  it('puts a role open in two metros in both', () => {
    const hits = metrosOf(at(['New York, NY', 'Austin, TX']));
    assert.deepEqual(hits.sort(), ['austin', 'new-york']);
  });

  it('survives the building codes and the missing spaces', () => {
    assert.deepEqual(metrosOf(at(['Mountain View (US-MTV-EMF680)'])), ['bay-area']);
    assert.deepEqual(metrosOf(at(['Austin (Ed Bluestein, Office)'])), ['austin']);
    assert.deepEqual(metrosOf(at(['Cary,North Carolina,United States'])), ['research-triangle']);
  });

  it('gives every metro a country to be checked against', () => {
    for (const metro of METROS) {
      assert.ok(Array.isArray(metro.countries) && metro.countries.length, `${metro.id} has no country guard`);
    }
  });
});

describe('the filters', () => {
  const rows = (n, over) => Array.from({ length: n }, (_, i) => job({ id: `${over.role ?? 'x'}-${i}`, ...over }));

  it('does not publish a filter too small to be worth a page', () => {
    const tracks = buildTracks(rows(MIN_TRACK_ROWS - 1, { role: 'Data Analyst' }), { now: NOW });
    assert.equal(tracks.some((track) => track.id === 'role-data-analyst'), false);
    const bigger = buildTracks(rows(MIN_TRACK_ROWS, { role: 'Data Analyst' }), { now: NOW });
    assert.equal(bigger.some((track) => track.id === 'role-data-analyst'), true);
  });

  it('never files a posting the catalog could not place under a role', () => {
    const tracks = buildTracks(rows(20, { role: 'Other' }), { now: NOW });
    assert.equal(tracks.some((track) => track.group === 'role'), false);
  });

  it('splits the whole list between the six field pages and no more', () => {
    const jobs = [...rows(5, { family: 'Software' }), ...rows(5, { family: 'Data & AI' })];
    const fields = buildTracks(jobs, { now: NOW }).filter((track) => track.group === 'field');
    assert.equal(fields.reduce((total, track) => total + track.jobs.length, 0), jobs.length);
  });

  it('states what every filter selects, in words, on the page and the hub', () => {
    for (const track of buildTracks(rows(10, { role: 'Software Engineer' }), { now: NOW })) {
      assert.ok(track.note && track.note.length > 30, `${track.id} does not say what it selects`);
      assert.ok(!track.path.startsWith('/') && !track.path.includes('..'), `${track.id} has an unsafe path`);
      assert.equal(track.path, track.path.toLowerCase());
    }
  });

  it('counts a filter in the scope of the file it is printed in', () => {
    const home = rows(6, { role: 'Software Engineer', countries: ['United States'] });
    const abroad = rows(6, { role: 'Software Engineer', countries: ['France'] });
    const tracks = buildTracks([...home, ...abroad], { now: NOW });
    const scoped = new Set(home);
    const block = renderFilters(tracks, {
      countOf: (track) => track.jobs.filter((row) => scoped.has(row)).length,
    });
    assert.ok(block.includes('Software Engineer (6)'), block);
    assert.ok(!block.includes('Software Engineer (12)'));
  });

  it('drops a group whose filters are all empty in this file', () => {
    const tracks = buildTracks(rows(8, { role: 'Software Engineer' }), { now: NOW });
    assert.equal(renderFilters(tracks, { countOf: () => 0 }), '');
  });

  it('slugifies a role the catalog could rename tomorrow', () => {
    assert.equal(slugify('Machine Learning Engineer'), 'machine-learning-engineer');
    assert.equal(slugify('Data & AI'), 'data-and-ai');
    assert.equal(slugify('  Spaced  Out  '), 'spaced-out');
  });

  it('keeps the groups in reading order and drops the empty ones', () => {
    const grouped = groupTracks(buildTracks(rows(8, { role: 'Software Engineer' }), { now: NOW }));
    assert.deepEqual(grouped.map((group) => group.id), ['field', 'role', 'place', 'quick']);
  });
});

describe('a filter page', () => {
  const track = {
    id: 'big-tech', path: 'company/big-tech', group: 'company', emoji: '🏛️',
    title: 'Big Tech', blurb: 'The giants.', note: 'A derived cut: technology sector, 10,000+ people.',
    jobs: [],
  };
  const pageFor = (homeRows, abroadRows, rowsPerPage = 400) => {
    const sections = [
      { title: 'United States & Canada', jobs: homeRows, note: '' },
      { title: 'Elsewhere in the world', jobs: abroadRows, note: 'Outside the home region.' },
    ].filter((section) => section.jobs.length);
    return renderTrackPages(
      { ...track, jobs: [...homeRows, ...abroadRows] },
      { now: NOW, sections, rowsPerPage },
    );
  };

  it('is one file while it fits, and grows a second page rather than a longer one', () => {
    const single = pageFor([job()], []);
    assert.deepEqual(Object.keys(single), ['lists/company/big-tech.md']);
    const paged = pageFor(Array.from({ length: 5 }, (_, i) => job({ id: `${i}` })), [], 2);
    assert.deepEqual(Object.keys(paged), [
      'lists/company/big-tech.md',
      'lists/company/big-tech-2.md',
      'lists/company/big-tech-3.md',
    ]);
    assert.ok(paged['lists/company/big-tech.md'].includes('Page 1 of 3'));
    assert.ok(paged['lists/company/big-tech-2.md'].includes('[← Page 1](big-tech.md)'));
  });

  it('keeps the two regions under their own headings, on every page', () => {
    const paged = pageFor(
      Array.from({ length: 3 }, (_, i) => job({ id: `home-${i}` })),
      Array.from({ length: 3 }, (_, i) => job({ id: `away-${i}`, countries: ['France'] })),
      2,
    );
    const second = paged['lists/company/big-tech-2.md'];
    // Page 2 straddles the two regions: it has to say which rows are which.
    assert.ok(second.includes('## United States & Canada'));
    assert.ok(second.includes('## Elsewhere in the world'));
  });

  it('climbs back out of its own directory correctly', () => {
    const nested = pageFor([job()], [])['lists/company/big-tech.md'];
    assert.ok(nested.includes('](../README.md)'), 'the hub link is wrong from a nested page');
    assert.ok(nested.includes('](../../README.md)'), 'the list link is wrong from a nested page');
    const flat = renderTrackPages(
      { ...track, path: 'remote', jobs: [job()] },
      { now: NOW, sections: [{ title: 'Everywhere', jobs: [job()], note: '' }] },
    )['lists/remote.md'];
    assert.ok(flat.includes('](README.md)'));
    assert.ok(flat.includes('](../README.md)'));
  });

  it('prints the rule once, on the first page only', () => {
    const paged = pageFor(Array.from({ length: 4 }, (_, i) => job({ id: `${i}` })), [], 2);
    assert.ok(paged['lists/company/big-tech.md'].includes('A derived cut'));
    assert.ok(!paged['lists/company/big-tech-2.md'].includes('A derived cut'));
  });
});

describe('the hub', () => {
  it('names every filter it has, with its count and its rule', () => {
    const tracks = buildTracks(
      Array.from({ length: 8 }, (_, i) => job({ id: `${i}`, role: 'Software Engineer' })),
      { now: NOW },
    );
    const hub = renderHub({
      tracks,
      now: NOW,
      listName: 'Internship Opportunities',
      noun: 'internships',
      homeLabel: 'the United States & Canada',
      coverageNote: 'Covers 3 of 4 employers.',
    });
    for (const track of tracks) {
      assert.ok(hub.includes(`](${track.path}.md)`), `${track.id} is not linked from the hub`);
    }
    assert.ok(hub.includes('Covers 3 of 4 employers.'));
  });

  it('changes when the filters change and not when the clock moves', () => {
    // Otherwise the hub is rewritten and committed every hour of every day,
    // and the history stops being a record of what opened and closed.
    const tracks = buildTracks(
      Array.from({ length: 8 }, (_, i) => job({ id: `${i}`, role: 'Software Engineer' })),
      { now: NOW },
    );
    const args = { tracks, listName: 'X', noun: 'roles', homeLabel: 'the US', coverageNote: '' };
    const today = renderHub({ ...args, now: NOW });
    const later = renderHub({ ...args, now: NOW + 5 * 86_400_000 });
    assert.notEqual(today, later);
    assert.equal(changedBeyondTimestamp(today, later), false);
  });

  it('does not let a stray pipe in a filter name break the table', () => {
    assert.equal(escapeMarkdown('Data | AI'), 'Data &#124; AI');
    assert.equal(escapeMarkdown('Semiconductors & chips'), 'Semiconductors & chips');
  });
});

describe('what the last column says', () => {
  it('is a relative age on the README and an absolute date on a filter page', () => {
    const rows = [job({ updatedAt: '2026-09-11T08:00:00Z' })];
    assert.ok(renderTable(rows, NOW).includes('>Age<'));
    assert.ok(renderTable(rows, NOW, { showAge: false }).includes('>Posted<'));
    assert.ok(renderTable(rows, NOW, { showAge: false }).includes('11 Sep 2026'));
  });

  it('says nothing about the date of an undated posting', () => {
    assert.equal(postedLabel(null), '—');
    assert.equal(postedLabel(''), '—');
    assert.equal(postedLabel('not a date'), '—');
    assert.equal(postedLabel('2026-01-05T23:30:00Z'), '5 Jan 2026');
  });

  it('keeps a filter page byte-identical as the clock moves', () => {
    // The churn rule: a page of 2,000 rows whose last column is a relative age
    // rewrites itself every day whether or not a posting moved, and the hourly
    // job commits it. An absolute date makes a diff mean something.
    const rows = [job({ id: 'a', updatedAt: '2026-09-11T08:00:00Z', title: 'Stable' })];
    const sections = [{ title: 'United States & Canada', jobs: rows, note: '' }];
    const track = { id: 't', path: 'remote', group: 'quick', emoji: '🌐', title: 'Remote', blurb: '', note: 'A rule.', jobs: rows };
    const today = renderTrackPages(track, { now: NOW, sections })['lists/remote.md'];
    const tomorrow = renderTrackPages(track, { now: NOW + 5 * 86_400_000, sections })['lists/remote.md'];
    assert.equal(today, tomorrow);
  });
});

describe('the byte budgets', () => {
  it('keeps a README GitHub will finish rendering', () => {
    // The failure this exists for: the new-grad list published a 554,638-byte
    // README, and GitHub stopped drawing it a third of the way down.
    assert.ok(README_MAX_BYTES < 512_000);
    assert.ok(PAGE_MAX_BYTES < 512_000);
  });

  it('caps a section and says what it is a sample of', () => {
    const jobs = Array.from({ length: 40 }, (_, i) => job({ id: `${i}`, updatedAt: daysAgo(1) }));
    const page = renderListings({
      jobs,
      now: NOW,
      featuredDays: 14,
      noun: 'internships',
      backToTop: 'x',
      sourceNote: 'note',
      caps: { featured: 5, fold: 5 },
      fieldPathOf: () => 'lists/field/software-engineering.md',
    });
    assert.ok(page.includes('**Showing 5 of 40.**'), page.slice(0, 400));
    assert.ok(page.includes('lists/field/software-engineering.md'));
    assert.equal((page.match(/<tr>\n<td>/g) ?? []).length, 5);
  });
});

describe('the metro table itself', () => {
  it('never lists a city name a comma-split can never match', () => {
    // `readLocation` splits on commas, so an `open` entry with a comma in it is
    // dead weight that looks like coverage. `austin, tx` was one, and the
    // Austin metro matched nothing on the rows that carry a bare city.
    for (const metro of METROS) {
      for (const city of metro.open ?? []) {
        assert.ok(!city.includes(','), `${metro.id}: "${city}" can never match a location part`);
      }
      for (const [city] of metro.cities ?? []) {
        assert.ok(!city.includes(','), `${metro.id}: "${city}" can never match a location part`);
      }
    }
  });
});

describe('who is posting this week', () => {
  const page = (jobs) =>
    renderListings({
      jobs,
      now: NOW,
      featuredDays: 14,
      noun: 'roles',
      backToTop: 'x',
      sourceNote: 'note',
      freshDays: 7,
    });

  it('counts only this week, and only employers with more than one', () => {
    const jobs = [
      ...Array.from({ length: 3 }, (_, i) => job({ id: `a${i}`, company: 'Acme', updatedAt: daysAgo(1) })),
      ...Array.from({ length: 2 }, (_, i) => job({ id: `b${i}`, company: 'Globex', updatedAt: daysAgo(6) })),
      ...Array.from({ length: 2 }, (_, i) => job({ id: `c${i}`, company: 'Initech', updatedAt: daysAgo(2) })),
      // One role each, and a pile posted a month ago: neither is "this week".
      job({ id: 'd', company: 'Hooli', updatedAt: daysAgo(1) }),
      ...Array.from({ length: 9 }, (_, i) => job({ id: `e${i}`, company: 'Soylent', updatedAt: daysAgo(30) })),
    ];
    // Sliced to the block itself: every one of these companies also appears in
    // the tables below it, so a whole-page `includes` proves nothing.
    const rendered = page(jobs);
    const start = rendered.indexOf('### 🔥 Posting the most this week');
    const block = rendered.slice(start, rendered.indexOf('###', start + 5));
    assert.ok(block.includes('**Acme** 3'));
    assert.ok(block.includes('**Globex** 2'));
    assert.ok(!block.includes('Hooli'), block);
    assert.ok(!block.includes('Soylent'), block);
  });

  it('says nothing at all rather than naming one employer', () => {
    const block = page([job({ company: 'Acme', updatedAt: daysAgo(1) })]);
    assert.ok(!block.includes('Posting the most this week'));
  });

  it('counts an undated posting as not this week', () => {
    const jobs = Array.from({ length: 4 }, (_, i) => job({ id: `${i}`, company: 'Acme', updatedAt: null }));
    assert.ok(!page(jobs).includes('Posting the most this week'));
  });
});

describe('the page cannot argue with itself', () => {
  it('counts the headline and the index over the same rows', () => {
    // The bug this exists for: the headline was computed by the caller from the
    // whole region and the index by the renderer from a capped slice, so the
    // page opened with "2,336 open roles" three lines above "Browse 1,500
    // roles by field".
    const jobs = [
      ...Array.from({ length: 30 }, (_, i) => job({ id: `s${i}`, family: 'Software' })),
      ...Array.from({ length: 12 }, (_, i) => job({ id: `d${i}`, family: 'Data & AI' })),
    ];
    const page = renderListings({
      jobs,
      now: NOW,
      featuredDays: 14,
      noun: 'roles',
      backToTop: 'x',
      sourceNote: 'note',
      caps: { featured: 5, fold: 5 },
    });
    const headline = /\*\*([\d,]+) open roles\*\*/.exec(page);
    const index = /### Browse ([\d,]+) roles by field/.exec(page);
    assert.ok(headline && index, page.slice(0, 300));
    assert.equal(headline[1], index[1]);
    assert.equal(headline[1], '42');
    // And the per-field counts sum to it, however few rows each section prints.
    const sections = [...page.matchAll(/\*\*\[[^\]]+\]\(#[^)]+\)\*\* \((\d+)\)/g)].map((m) => Number(m[1]));
    assert.equal(sections.reduce((total, n) => total + n, 0), 42);
  });
});

describe('the link out of a section', () => {
  it('never puts a count on a page this section did not count', () => {
    // A field page carries BOTH regions; a README section counts one. "All 21
    // on one page" pointed at a page holding 320, and the two READMEs
    // advertised the same page as holding 1 and 6.
    const page = renderListings({
      jobs: [job({ id: 'a' }), job({ id: 'b' })],
      now: NOW,
      featuredDays: 14,
      noun: 'roles',
      backToTop: 'x',
      sourceNote: 'note',
      caps: { featured: 25, fold: 50 },
      fieldPathOf: () => 'lists/field/software-engineering.md',
    });
    assert.ok(page.includes('both regions →'), page.slice(-400));
    assert.ok(!/All \d+ on one page/.test(page));
  });

  it('counts the sample against this section when it is capped', () => {
    const page = renderListings({
      jobs: Array.from({ length: 10 }, (_, i) => job({ id: `${i}` })),
      now: NOW,
      featuredDays: 14,
      noun: 'roles',
      backToTop: 'x',
      sourceNote: 'note',
      caps: { featured: 2, fold: 2 },
      fieldPathOf: () => 'lists/field/software-engineering.md',
    });
    assert.ok(page.includes('**Showing 2 of 10.**'));
  });
});

describe('the clock on its own is not a change', () => {
  it('reads a spelled-out state, and still keeps the capital out of Puget Sound', () => {
    const at = (loc) => metrosOf({ countries: ['United States'], locations: [loc], cities: [] });
    assert.deepEqual(at('Renton, Washington, United States'), ['seattle']);
    assert.deepEqual(at('Bellevue, Washington, USA'), ['seattle']);
    assert.deepEqual(at('Washington, DC'), ['washington-dc']);
    assert.deepEqual(at('Washington, District of Columbia'), ['washington-dc']);
  });

  it('does not count an age cell ticking over as a change worth committing', () => {
    // On 2,336 rows about one in twenty-four ticks every hour, so without this
    // almost every hourly run commits a README in which nothing happened.
    // Aged so that a day's passing crosses none of the boundaries that DO say
    // something — the 3-day 🆕 marker, the 7-day "posted this week" count, the
    // 14-day fold — leaving the age cell as the only difference.
    const jobs = [job({ id: 'a', updatedAt: daysAgo(10) }), job({ id: 'b', updatedAt: daysAgo(40) })];
    const render = (now) =>
      renderListings({ jobs, now, featuredDays: 14, noun: 'roles', backToTop: 'x', sourceNote: 'note' });
    const today = render(NOW);
    const tomorrow = render(NOW + 86_400_000);
    assert.notEqual(today, tomorrow);
    assert.equal(changedBeyondTimestamp(today, tomorrow), false);
  });

  it('still counts a role arriving or leaving as a change', () => {
    const base = [job({ id: 'a', updatedAt: daysAgo(3) })];
    const render = (jobs) =>
      renderListings({ jobs, now: NOW, featuredDays: 14, noun: 'roles', backToTop: 'x', sourceNote: 'note' });
    assert.equal(changedBeyondTimestamp(render(base), render([...base, job({ id: 'b', company: 'Globex' })])), true);
  });
});
