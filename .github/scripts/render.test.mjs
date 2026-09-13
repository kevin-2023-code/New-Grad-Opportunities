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
    url: 'https://trueinterview.io/applications/jobs?role=1',
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
