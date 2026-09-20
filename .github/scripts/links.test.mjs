// Every relative link this repository publishes points at a file that exists.
//
// Worth a test of its own because the failure is invisible to the generator: a
// filter that drops below the minimum loses its page, a role the catalog
// renames changes a filename, and the prose that named either of them keeps
// rendering as a link — one that answers GitHub's 404 page. The generator
// cannot catch it, because the broken half is hand-written, and the prose
// cannot catch it, because the generated half moves hourly.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `.md` file this repository publishes, README and generated alike. */
async function markdownFiles(relative = '.') {
  const entries = await readdir(join(ROOT, relative), { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await markdownFiles(child)));
    else if (entry.name.endsWith('.md')) found.push(child);
  }
  return found;
}

/** The link targets in one file that point at something in this repository. */
function relativeLinks(markdown) {
  const targets = [];
  for (const match of markdown.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    // External links, in-page anchors and the issue shorthand GitHub resolves
    // itself are all somebody else's to keep alive.
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    if (href.startsWith('../../issues') || href.startsWith('../../pull')) continue;
    targets.push(href.split('#')[0]);
  }
  return targets.filter(Boolean);
}

describe('the links', () => {
  it('all point at a file that is actually in the repository', async () => {
    const files = await markdownFiles();
    assert.ok(files.includes('README.md'));
    const broken = [];
    for (const file of files) {
      const markdown = await readFile(join(ROOT, file), 'utf8');
      for (const href of relativeLinks(markdown)) {
        const target = resolve(join(ROOT, dirname(file)), href);
        // Nothing may point outside the repository, whatever it resolves to.
        if (!target.startsWith(resolve(ROOT))) {
          broken.push(`${file} → ${href} (escapes the repository)`);
          continue;
        }
        const exists = await stat(target).then(() => true, () => false);
        if (!exists) broken.push(`${file} → ${href}`);
      }
    }
    assert.deepEqual(broken, [], `broken links:\n  ${broken.join('\n  ')}`);
  });
});
