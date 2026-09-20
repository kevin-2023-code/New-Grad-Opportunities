// What KIND of employer a row is at: the sector it trades in, and how many
// people work there.
//
// ── Why this is two axes and not one ─────────────────────────────────────────
//
// "Big tech", "fintech" and "mid-sized" are the three things a candidate filters
// on, and they are not the same kind of fact. Two of them are about the
// BUSINESS (payments, chips, defence) and one is about the SIZE of the company
// (ten people or ten thousand). Squashing them into one list of buckets is what
// forces the question nobody can answer — is Stripe fintech or is it a
// scale-up? — so they are stored separately and the buckets a reader sees are
// DERIVED from the pair:
//
//   * **Big Tech** is a technology-sector employer with 10,000+ people. It is a
//     rule, printed on the page, not a list of opinions — which is why Cisco and
//     Samsung are in it and Ford (10,000+ people, not a technology company) is
//     not.
//   * **Mid-sized tech** is a technology-sector employer with 200–999 people,
//     and **Startups** is the same test under 200.
//   * **Fintech**, **Quant trading**, **Semiconductors** and the rest are the
//     sector alone, at any size.
//
// ── The rule the registry holds ──────────────────────────────────────────────
//
// **A company nobody could identify is unclassified, never guessed.** The
// registry carries an entry only where the employer was actually recognised;
// everything else answers `{ sector: null, size: null }`, appears in every
// other list exactly as before, and is counted on the hub page as coverage. A
// sector guessed from a company's NAME is the expensive failure here: "Fable
// Security" is not a security company, "Roshal Health" is a staffing agency,
// and a reader who filters to Fintech and gets neither has lost the reason to
// trust any of the other filters.

import { companyKey } from './companies.mjs';
import { COMPANY_SEGMENTS } from './company-registry.mjs';

/**
 * The sectors, in the order the hub prints them: the ones most of this
 * audience is aiming at first, then the rest, then the catch-all.
 *
 * `tech` marks the sectors the size cuts are taken over — see `BIG_TECH` below.
 * A bank is not a technology company for the purposes of "big tech" even though
 * it employs thousands of engineers, and the sectors flagged here are the ones
 * where the answer is yes.
 */
export const SECTORS = [
  { id: 'ai', emoji: '🧠', label: 'AI labs & AI infrastructure', tech: true,
    blurb: 'Foundation-model labs, AI products, evaluation and data vendors, GPU clouds.' },
  { id: 'consumer-internet', emoji: '📱', label: 'Consumer internet & media', tech: true,
    blurb: 'Social, search, streaming, messaging and consumer subscription apps.' },
  { id: 'ecommerce-marketplace', emoji: '🛒', label: 'E-commerce & marketplaces', tech: true,
    blurb: 'Retail tech, marketplaces, delivery, ride-hail and travel.' },
  { id: 'dev-infra', emoji: '☁️', label: 'Developer tools, cloud & data infrastructure', tech: true,
    blurb: 'Cloud, CDNs, databases, data platforms, observability and DevOps.' },
  { id: 'enterprise-saas', emoji: '🏢', label: 'Enterprise & business software', tech: true,
    blurb: 'CRM, ERP, HR, design, productivity and collaboration software.' },
  { id: 'security', emoji: '🔒', label: 'Cybersecurity', tech: true,
    blurb: 'Security products, detection, identity and offensive-security vendors.' },
  { id: 'fintech', emoji: '💳', label: 'Fintech, payments & crypto', tech: true,
    blurb: 'Payments, neobanks, lending, trading apps, crypto and financial infrastructure.' },
  { id: 'quant-trading', emoji: '📈', label: 'Quant trading & hedge funds', tech: false,
    blurb: 'Market makers, proprietary trading firms and quantitative funds.' },
  { id: 'banking-finance', emoji: '🏦', label: 'Banks, insurers & asset managers', tech: false,
    blurb: 'Banks, card networks, exchanges, insurers and asset managers.' },
  { id: 'semiconductors', emoji: '🔬', label: 'Semiconductors & chips', tech: true,
    blurb: 'Chip design, EDA, foundries and semiconductor capital equipment.' },
  { id: 'hardware-devices', emoji: '🖥️', label: 'Hardware, devices & networking', tech: true,
    blurb: 'Consumer and enterprise hardware, networking gear, robotics and instruments.' },
  { id: 'aerospace-defense', emoji: '🚀', label: 'Aerospace & defence', tech: false,
    blurb: 'Space, satellites, defence primes and defence technology.' },
  { id: 'autonomy-mobility', emoji: '🚗', label: 'Autonomy, automotive & mobility', tech: false,
    blurb: 'Self-driving, automotive, drones, eVTOL and transport technology.' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming & interactive', tech: true,
    blurb: 'Games, game engines and interactive entertainment.' },
  { id: 'health-bio', emoji: '🧬', label: 'Health, biotech & medical devices', tech: false,
    blurb: 'Healthcare, health insurance technology, biotech, pharma and devices.' },
  { id: 'energy-industrial', emoji: '⚡', label: 'Energy, climate & industrial', tech: false,
    blurb: 'Energy, climate technology, utilities, manufacturing and industrials.' },
  { id: 'engineering-services', emoji: '📐', label: 'Engineering & architecture firms', tech: false,
    blurb: 'Civil, structural and environmental engineering and AEC consultancies.' },
  { id: 'it-consulting', emoji: '🧾', label: 'IT services & consulting', tech: false,
    blurb: 'Systems integrators, management consultancies, outsourcing and staffing.' },
  { id: 'public-research', emoji: '🏛️', label: 'Government, labs & universities', tech: false,
    blurb: 'Agencies, national laboratories, universities and research institutes.' },
  { id: 'other-industry', emoji: '💼', label: 'Other industries', tech: false,
    blurb: 'A real classification that none of the sectors above covers.' },
];

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

/** Headcount bands, largest first. */
export const SIZES = [
  { id: 'mega', label: '10,000+ people' },
  { id: 'large', label: '1,000–9,999 people' },
  { id: 'mid', label: '200–999 people' },
  { id: 'startup', label: 'Under 200 people' },
];

const SIZE_BY_ID = new Map(SIZES.map((size) => [size.id, size]));

/** The empty answer, shared so callers can compare against one object shape. */
const UNCLASSIFIED = Object.freeze({ sector: null, size: null });

/**
 * What the registry knows about the employer on this row.
 *
 * Total: every company answers, and a company the registry has never heard of
 * answers `{ sector: null, size: null }` rather than throwing or guessing. An
 * unknown sector and a company with no sector are the same thing here and both
 * are honest; what would not be honest is filling either in from the row.
 */
export function segmentOf(company) {
  const key = companyKey(company);
  if (!key) return UNCLASSIFIED;
  const entry = COMPANY_SEGMENTS[key];
  if (!entry) return UNCLASSIFIED;
  const sector = SECTOR_BY_ID.has(entry.sector) ? entry.sector : null;
  const size = SIZE_BY_ID.has(entry.size) ? entry.size : null;
  return sector === null && size === null ? UNCLASSIFIED : { sector, size };
}

export function sectorById(id) {
  return SECTOR_BY_ID.get(id) ?? null;
}

export function sizeById(id) {
  return SIZE_BY_ID.get(id) ?? null;
}

/** True when this sector is a technology sector for the size cuts below. */
export function isTechSector(id) {
  return Boolean(SECTOR_BY_ID.get(id)?.tech);
}

/**
 * The three size cuts, derived rather than declared.
 *
 * Each is a PAIR of facts about the employer — "a technology company" and "this
 * many people" — so the page can print the rule instead of asking a reader to
 * trust a list. `null` on either side means the row is not in the cut: an
 * employer whose headcount nobody could establish is not a startup.
 */
export const BIG_TECH = { id: 'big-tech', sizes: ['mega'] };
export const LARGE_TECH = { id: 'large-tech', sizes: ['large'] };
export const MID_TECH = { id: 'mid-size-tech', sizes: ['mid'] };
export const STARTUP_TECH = { id: 'startups', sizes: ['startup'] };

export function inSizeCut(segment, cut) {
  return Boolean(segment.sector) && isTechSector(segment.sector) && cut.sizes.includes(segment.size);
}

/**
 * How much of a set the registry actually covers.
 *
 * Printed on the hub page beside the filters. A filter list with no coverage
 * number reads as a complete taxonomy of the market, and it is not one: it is
 * as complete as the registry, and the registry is hand-written.
 */
export function coverage(jobs) {
  const companies = new Map();
  let rowsClassified = 0;
  for (const job of jobs) {
    const key = companyKey(job.company);
    if (!key) continue;
    const segment = segmentOf(job.company);
    if (segment.sector) rowsClassified += 1;
    if (!companies.has(key)) companies.set(key, Boolean(segment.sector));
  }
  const classifiedCompanies = [...companies.values()].filter(Boolean).length;
  return {
    rows: jobs.length,
    rowsClassified,
    companies: companies.size,
    companiesClassified: classifiedCompanies,
  };
}
