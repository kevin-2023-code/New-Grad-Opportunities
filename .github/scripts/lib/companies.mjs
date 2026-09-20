// One employer, one name, one key.
//
// The catalog stores a company as whatever string the posting carried, and the
// same employer reaches it several ways: `SpaceX` from one board and `Spacex`
// from another, `OpenAI` and `Openai`, `CoreWeave` and `Coreweave`. Seventeen
// employers in today's snapshot are spelled two ways, which is enough to make a
// generated list look ungenerated — the same company shown twice, a dozen rows
// apart, under two spellings.
//
// So every surface that names a company goes through `companyLabel`, and every
// surface that FILES one goes through `companyKey`. The key is what the company
// registry is keyed on, which is the whole reason this exists: a segment
// registry keyed on raw strings would classify `SpaceX` and leave `Spacex` in
// the unclassified pile.
//
// The rules are a transcription of the site's own `formatCompany` /
// `companySlug` (`web/lib/labels.ts` in the app repository), and they are a
// transcription rather than an import because this repository has no build step
// and must render from a committed JSON file with nothing installed. The same
// transcription lives in the question-bank repository's `scripts/labels.py`,
// which is what lets a company page there and a job row here agree on the
// employer's name.

/**
 * Tokens that stay uppercase when title-casing a name we have no label for.
 */
const ACRONYMS = new Set([
  'ai', 'ml', 'ui', 'ux', 'ios', 'qa', 'sre', 'api', 'sde', 'swe', 'llm',
  'nlp', 'hr', 'it', 'pm', 'tpm', 'em', 'hp', 'ibm', 'kla', 'amd', 'nxp',
  'gm', 'ge', 'bmw', 'sap', 'usa', 'uk',
]);

/**
 * Spellings only a human can fix: casing the rules cannot recover, and word
 * breaks that are not in the string.
 *
 * Keyed by the LOWERCASED raw name, and consulted before every other rule —
 * which is the whole point, since `Spacex` already carries a capital and would
 * otherwise be kept exactly as the posting wrote it.
 *
 * Adding an entry is the fix for "this employer appears twice in the list".
 */
export const COMPANY_LABELS = new Map(Object.entries({
  'spacex': 'SpaceX',
  'openai': 'OpenAI',
  'xai': 'xAI',
  'x-ai': 'xAI',
  'deepmind': 'DeepMind',
  'abbvie': 'AbbVie',
  'applovin': 'AppLovin',
  'circleci': 'CircleCI',
  'clickup': 'ClickUp',
  'coreweave': 'CoreWeave',
  'pagerduty': 'PagerDuty',
  'sonarsource': 'SonarSource',
  'gitlab': 'GitLab',
  'github': 'GitHub',
  'paypal': 'PayPal',
  'youtube': 'YouTube',
  'doordash': 'DoorDash',
  'bytedance': 'ByteDance',
  'tiktok': 'TikTok',
  'linkedin': 'LinkedIn',
  'nvidia': 'NVIDIA',
  'ibm': 'IBM',
  'aws': 'AWS',
  'sap': 'SAP',
  'sofi': 'SoFi',
  'capitalone': 'Capital One',
  'goldmansachs': 'Goldman Sachs',
  'jpmorgan': 'JPMorgan',
  'twosigma': 'Two Sigma',
  'akunacapital': 'Akuna Capital',
  'walmartlabs': 'Walmart Labs',
  'scaleai': 'Scale AI',
  'scale.ai': 'Scale AI',
  'elevenlabs': 'ElevenLabs',
  'mistral ai': 'Mistral AI',
  'mistral-ai': 'Mistral AI',
  'nuro': 'Nuro',
  'margo': 'Margo',
  'awin': 'Awin',
  'chaos industries': 'CHAOS Industries',
  'fieldai': 'Field AI',
  'e space': 'E-Space',
  'crowdstrike': 'CrowdStrike',
  'servicenow': 'ServiceNow',
  'mongodb': 'MongoDB',
  'hashicorp': 'HashiCorp',
  'digitalocean': 'DigitalOcean',
  'squarespace': 'Squarespace',
  'thoughtworks': 'Thoughtworks',
  'epam': 'EPAM',
  'pwc': 'PwC',
  'ey': 'EY',
  'kpmg': 'KPMG',
  'tcs': 'TCS',
  'wsp': 'WSP',
  'hpe': 'HPE',
  'amd': 'AMD',
  'kla': 'KLA',
  'nxp semiconductors': 'NXP Semiconductors',
  // One employer reaching the catalog under a legal name and a trading name.
  // Only where the two are plainly the same company: an entry here MERGES two
  // rows of the list into one, so it is the alias table's one irreversible
  // edit and is not the place to be clever about suffixes in general.
  'chicagotrading': 'Chicago Trading',
  'verkada inc.': 'Verkada',
  'verkada inc': 'Verkada',
  'valon mortgage': 'Valon',
}));

/** Title-cases a slug-shaped name, keeping known acronyms uppercase. */
export function titleize(value) {
  return String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => (ACRONYMS.has(part.toLowerCase()) ? part.toUpperCase() : part.slice(0, 1).toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * The display name for a company as the catalog stored it.
 *
 * Free text the catalog holds as authored — anything with a space or a capital
 * that the table above does not override — is left exactly as written. That is
 * the site's own rule and the reason "Susquehanna International Group" comes
 * back whole rather than re-cased into something nobody writes.
 */
export function companyLabel(company) {
  const raw = String(company ?? '').trim();
  if (!raw) return '';
  const known = COMPANY_LABELS.get(raw.toLowerCase());
  if (known) return known;
  if (/[A-Z]/.test(raw) || raw.includes(' ')) return raw;
  return titleize(raw.toLowerCase());
}

/**
 * The key one employer is filed under — the site's own slug derivation.
 *
 * Derived from the LABEL rather than the raw string, so the alias table above
 * collapses two spellings onto one key for free. `&` becomes ` and ` before the
 * rest is stripped, so `Ci&t`, `CI&T` and `Ci and T` all collapse onto one key
 * — which is the point, they are one employer — and `H&M` becomes `h-and-m`
 * rather than the `h-m` a bare strip would produce.
 */
export function companyKey(company) {
  return companyLabel(company)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
