# Contributing

This list is **generated**, not maintained by hand. Nobody types a row into the README, which is
why there is no "add a job" pull request to make.

## Setting the repository up

The hourly run **commits to this repository**, so GitHub Actions needs permission to write:

> Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save

Without it every run reads the catalog, renders the files, and fails on the push with a 403.
There is nothing else to configure — the API needs no key, and the generator has no dependencies.

Scheduled workflows run from the repository's **default branch** only, and GitHub switches the
schedule off after 60 days of no repository activity. This one commits whenever the listings move,
which is its own heartbeat; the banner on the Actions tab is the only warning if it is ever
switched off.

## Something on the list is wrong

Stale role, wrong company, wrong location, a role that is not really entry-level —
[open an issue](../../issues/new) with the row and what is wrong with it.

Please fix it at the source rather than in the table: these rows come from the TrueInterview job
catalog, which also feeds the board, the search and the email digests, so a correction there fixes
every surface at once, and a correction here is overwritten by the next hourly run.

## A role is missing

Same thing — [open an issue](../../issues/new) with the posting URL. Two reasons a real role is
absent, both fixable:

* **The catalog has not seen it.** The ingest is broad but not exhaustive.
* **It was classified out of this list.** The query is *new-grad roles* in the six technical fields
  ([`config.json`](./.github/scripts/config.json)). A posting the classifier read as a full-time
  role, or whose field was read as non-technical, will not appear. Say so in the issue and the
  classification gets looked at.

## Adding a company to the registry

The company filters — [Big Tech](./lists/company/big-tech.md), fintech, quant trading, mid-sized
tech, startups — are derived from two facts about the **employer**, which no job posting carries:
what sector it trades in, and how many people work there. Those live in one hand-written file,
[`lib/company-registry.mjs`](./.github/scripts/lib/company-registry.mjs), keyed by the same slug
every other surface files a company under.

If an employer you know is missing from the company filters, that is the two-line fix:

```js
  'ramp': { sector: 'fintech', size: 'large' },
```

* **`sector`** is one of the ids in [`lib/segments.mjs`](./.github/scripts/lib/segments.mjs) —
  `ai`, `fintech`, `quant-trading`, `semiconductors`, `dev-infra`, `enterprise-saas`,
  `aerospace-defense`, `engineering-services` and the rest. The file lists what each one covers.
* **`size`** is a headcount band: `mega` (10,000+), `large` (1,000–9,999), `mid` (200–999),
  `startup` (under 200).
* **The key** is what `companyKey('Ramp')` returns: lowercase, `&` spelled out, everything else
  hyphenated. A test fails if a key is not in that form, because a key that is not canonical is an
  entry nothing will ever look up.

Three rules, and the first one matters more than the other two:

1. **If you are not sure, leave it out.** `null` on either field is a legitimate answer and so is
   no entry at all. A company that is absent appears in the main list and in every field, role and
   location filter exactly as before — it is simply in no company-type filter. A company that is
   *wrong* puts an employer on a page a reader chose deliberately, and it is the reason they stop
   trusting the other filters. Never infer a sector from the name: "Fable Security" is not
   necessarily a security company.
2. **Size is the company, not the office.** Alphabet's headcount for Google; a household-brand
   subsidiary (LinkedIn, Waymo) is judged on the subsidiary.
3. **"Big Tech" is not a field you can set.** It is derived: a technology-sector employer with
   10,000+ people. If a company belongs there, the fix is its sector and size, not a new bucket.

## Changing how the list is built

Pull requests against `.github/scripts/` are welcome.

```bash
node --test .github/scripts/*.test.mjs   # the tests CI runs (includes a link check)
node .github/scripts/fetch.mjs           # re-read the catalog (network)
node .github/scripts/render.mjs          # re-render from the committed listings.json (no network)
```

What the generator writes:

| Path | What it is |
| --- | --- |
| `README.md` / `README-Global.md` | The index: the newest roles per field, between the `LISTINGS` markers. |
| `lists/README.md` | The filter hub: every filter, its count, and the rule it applies. |
| `lists/company/*.md` | One page per sector and per size cut. |
| `lists/role/*.md` | One page per role the catalog classifies. |
| `lists/place/*.md` | One page per metro. |
| `lists/field/*.md` | One page per technical field — every row, not the sample the README shows. |
| `lists/remote.md`, `lists/new-this-week.md` | The two cuts that are about the posting rather than the employer. |

Everything under `lists/` is generated whole and **pruned**: a file there that a run did not
produce is deleted, because a filter page nothing updates keeps answering with roles that closed
weeks ago.

Five things to know before changing the generator:

1. **`render.mjs` reads `listings.json`, never the network.** Work on the layout against the
   committed data — it is a real snapshot and it holds the awkward rows (a company called `Ci&t`,
   an office spelled three different ways, postings with no country at all).
2. **Only what is between the `LISTINGS:START` / `LISTINGS:END` markers is generated.** Everything
   else in the README is hand-written and survives every run, so prose fixes are ordinary pull
   requests.
3. **A failed read must never publish an empty list.** `fetch.mjs` throws rather than writing one,
   and the workflow leaves the committed files alone. A list that says "no roles" after an outage
   is worse than a list an hour out of date — it tells a reader the jobs are gone.
4. **Nothing is written until every byte budget passes.** GitHub stops rendering a Markdown file at
   512,000 bytes and prints a truncation notice instead of the rest — this list published a
   554,638-byte README once, and its bottom third was simply not drawn. `render.mjs` renders
   everything in memory, checks the budgets, and only then writes.
5. **A filter must say what it selects.** Every track carries a `note` that is printed on its page
   and in the hub table. A filter without one is an opinion with a table under it.

## The data

Every row is public metadata about a posting somebody else published: company, title, location,
the employer's application URL, and when it was posted. The posting's own text is not copied into
this repository — the `Apply` link goes to the employer, and the role link goes to the board.

The same rows are available as JSON at [`listings.json`](./.github/scripts/listings.json), or from
the public API that produced them:

```bash
curl 'https://trueinterview.io/api/v1/jobs?kind=newgrad&family=tech&limit=50'
```

No key, 240 requests a minute, documented at <https://trueinterview.io/developers/api>.
