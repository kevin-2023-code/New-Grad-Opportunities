// The one place this repository talks to TrueInterview.
//
// It reads `GET /api/v1/jobs` — the public, key-less, documented operation
// (https://trueinterview.io/openapi.json, operationId `listJobs`) — and pages
// it until the window is exhausted. Nothing else here knows the API exists, so
// a change to the contract is a change to this file.
//
// Three rules it holds, all of them about not publishing a lie:
//
//   1. **A failed read is never an empty list.** Every failure throws. The
//      caller's job is to leave the committed files alone, because a list that
//      renders "0 roles" after an outage is worse than one an hour stale — it
//      tells a reader the roles are gone.
//   2. **A page that could not be parsed is a failure**, not a page of zero
//      rows. The envelope is `{ ok, data }` and anything else is an error page,
//      a redirect, or a proxy.
//   3. **It stops.** `page.hasMore` ends the walk, and MAX_PAGES ends it
//      anyway, so a contract change that always answers `hasMore: true` costs
//      one run rather than the Actions minutes of a whole account.

/** Where the API lives. Overridable so a fork can point at its own deploy. */
export const DEFAULT_API_BASE = 'https://trueinterview.io';

/** The largest page the API serves (`API_MAX_LIMIT` in its own spec). */
const PAGE_SIZE = 50;

/** A hard stop on the walk: 200 pages is 10,000 roles. */
const MAX_PAGES = 200;

/** How long one request may take before it is abandoned. */
const TIMEOUT_MS = 30_000;

/** How many times a single page is retried, and how long between attempts. */
const RETRIES = 3;
const RETRY_BACKOFF_MS = [2_000, 6_000, 15_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for a status worth trying again — a blip, a rate limit, a cold start. */
function worthRetrying(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** One page of listings, or a thrown error. Never a partial answer. */
async function fetchPage(base, query, page, fetchImpl) {
  const url = new URL('/api/v1/jobs', base);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(PAGE_SIZE));

  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]);
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'trueinterview-job-list (+https://trueinterview.io)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // The API answers every failure as JSON with a machine code, so say
        // which one rather than only the status — `CATALOG_UNAVAILABLE` and
        // `VALIDATION_ERROR` call for opposite reactions from whoever reads
        // the run log.
        const detail = await res.text().catch(() => '');
        lastError = new Error(`GET ${url.pathname}${url.search} answered ${res.status}: ${detail.slice(0, 400)}`);
        if (!worthRetrying(res.status)) throw lastError;
        continue;
      }
      const body = await res.json();
      if (!body || body.ok !== true || !body.data || !Array.isArray(body.data.jobs)) {
        throw new Error(`GET ${url.pathname}${url.search} did not answer the documented envelope.`);
      }
      return body.data;
    } catch (err) {
      lastError = err;
      // An abort or a socket error is worth another attempt; a refusal we
      // already decided not to retry re-throws on the next loop exit.
      if (attempt === RETRIES) break;
    }
  }
  throw lastError ?? new Error(`GET ${url.pathname}${url.search} failed.`);
}

/**
 * Every listing matching `query`, in the API's own order (newest first).
 *
 * `query` carries the operation's documented parameters — `kind`, `seniority`,
 * `family`, `location`, `postedWithinDays`. Paging is this function's business.
 */
export async function fetchAllJobs(query, { base = DEFAULT_API_BASE, fetchImpl = fetch, log = () => {} } = {}) {
  const jobs = [];
  const seen = new Set();
  let page = 1;
  let total = null;

  for (; page <= MAX_PAGES; page += 1) {
    const data = await fetchPage(base, query, page, fetchImpl);
    total = data.page?.total ?? total;
    for (const job of data.jobs) {
      // The catalog is written to while this walks it, so a row can shift
      // between pages and arrive twice. Keeping the first copy is what makes
      // the output a set rather than a slice of a moving list.
      if (!job || typeof job.id !== 'string' || seen.has(job.id)) continue;
      seen.add(job.id);
      jobs.push(job);
    }
    log(`  page ${page}: ${data.jobs.length} rows (${jobs.length} kept of ${total ?? '?'})`);
    if (!data.page?.hasMore) return { jobs, total: total ?? jobs.length, pages: page };
  }
  throw new Error(`Stopped after ${MAX_PAGES} pages — the API kept reporting more results.`);
}
