# New Grad Opportunities

**Entry-level, full-time tech roles for new graduates — refreshed every hour.**

Every row below is pulled straight from the [TrueInterview job catalog](https://trueinterview.io/applications/jobs)
by a scheduled job in this repository. Nothing is typed by hand, so a role that closes disappears
from the list on the next run instead of wasting your afternoon.

> 🌍 **Roles outside the United States and Canada** are in [README-Global.md](./README-Global.md).
> 🎓 **Looking for internships?** → [Internship-Opportunities](https://github.com/kevin-2023-code/Internship-Opportunities)
> 📬 **Want these in your inbox?** TrueInterview mails a digest of new roles matching your search — [set it up here](https://trueinterview.io/applications/jobs).

<!-- LISTINGS:START — everything between these markers is generated hourly. Edit the scripts, not the table. -->

_The hourly refresh has not run in this repository yet. The first run of the **Update listings** workflow writes the table here — trigger it by hand from the Actions tab, or wait for the top of the hour._

<!-- LISTINGS:END -->

---

## How this list is built

1. **The catalog.** TrueInterview continuously ingests postings, deduplicates them, and classifies
   each one — field, seniority rung, work mode, city and country. A posting that stops appearing at
   its source is retired.
2. **The query.** Once an hour this repository asks the public API for everything that matches
   [`config.json`](./.github/scripts/config.json): full-time roles at the **new-grad** rung, in the
   six technical fields, still open. No API key — the endpoint is public and documented at
   <https://trueinterview.io/developers/api>.
3. **The files.** [`fetch.mjs`](./.github/scripts/fetch.mjs) writes
   [`listings.json`](./.github/scripts/listings.json); [`render.mjs`](./.github/scripts/render.mjs)
   renders the tables between the markers above. A run that cannot read the API changes nothing —
   an hour-old list beats a list that says there are no jobs.

**Prefer the data?** [`listings.json`](./.github/scripts/listings.json) carries every role in the
window with its structured fields — field, rung, cities, countries, work mode and both URLs. Or
call the API yourself:

```bash
curl 'https://trueinterview.io/api/v1/jobs?kind=newgrad&seniority=new-grad&family=tech&limit=50'
```

## What the columns mean

| Column | What it is |
| --- | --- |
| **Company** | The employer, as the posting names them. `↳` means "same company as the row above". |
| **Role** | The job title, linking to the role on TrueInterview, where you can score it against your CV and track the application. |
| **Location** | Canonical city where the pipeline could resolve one, otherwise what the posting said. |
| **Apply** | The employer's own application page. |
| **Age** | How long ago the posting was published or last re-posted. |

## Contributing

A wrong or stale row is almost always a catalog problem rather than a rendering one, so
[open an issue](../../issues/new) with the row and what is wrong with it and it gets fixed at the
source, for every surface at once. Changes to how the list is built are pull requests against
`.github/scripts/` — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

The scripts in this repository are MIT-licensed. The job postings themselves belong to the
employers who published them; this list links to them and does not reproduce their text.
