# Contributing

This list is **generated**, not maintained by hand. Nobody types a row into the README, which is
why there is no "add a job" pull request to make.

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
* **It was classified out of this list.** The query is full-time roles at the *new-grad* rung in
  the six technical fields ([`config.json`](./.github/scripts/config.json)). A posting whose title
  reads as senior, or whose field was read as non-technical, will not appear. Say so in the issue
  and the classification gets looked at.

## Changing how the list is built

Pull requests against `.github/scripts/` are welcome.

```bash
node --test .github/scripts/*.test.mjs   # the tests CI runs
node .github/scripts/fetch.mjs           # re-read the catalog (network)
node .github/scripts/render.mjs          # re-render from the committed listings.json (no network)
```

Three things to know before changing the generator:

1. **`render.mjs` reads `listings.json`, never the network.** Work on the layout against the
   committed data — it is a real snapshot and it holds the awkward rows (a company called `Ci&t`,
   an office spelled three different ways, postings with no country at all).
2. **Only what is between the `LISTINGS:START` / `LISTINGS:END` markers is generated.** Everything
   else in the README is hand-written and survives every run, so prose fixes are ordinary pull
   requests.
3. **A failed read must never publish an empty list.** `fetch.mjs` throws rather than writing one,
   and the workflow leaves the committed files alone. A list that says "no roles" after an outage
   is worse than a list an hour out of date — it tells a reader the jobs are gone.

## The data

Every row is public metadata about a posting somebody else published: company, title, location,
the employer's application URL, and when it was posted. The posting's own text is not copied into
this repository — the `Apply` link goes to the employer, and the role link goes to the board.

The same rows are available as JSON at [`listings.json`](./.github/scripts/listings.json), or from
the public API that produced them:

```bash
curl 'https://trueinterview.io/api/v1/jobs?kind=newgrad&seniority=new-grad&family=tech&limit=50'
```

No key, 240 requests a minute, documented at <https://trueinterview.io/developers/api>.
