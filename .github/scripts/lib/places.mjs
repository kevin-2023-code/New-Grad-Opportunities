// Which metro a posting is in — or, far more often, the honest answer that we
// cannot tell.
//
// ── Why this is not a string match ───────────────────────────────────────────
//
// Only about a third of the rows carry the pipeline's canonical `cities`; the
// rest carry whatever the employer's ATS exported, and this snapshot alone
// holds `San Francisco`, `US,CA,San Jose`, `Santa Clara, CA, US`,
// `Mountain View (US-MTV-EMF680)` and `Spring, Texas, United States of America`.
// A naive contains-check over that produces exactly one kind of bug, and it is
// the kind nobody reports: **Newark, NJ filed under the Bay Area**, because
// Newark is also a town in Alameda County. Berkeley is in New Jersey too,
// Oakland is in nine states, Cambridge is in Massachusetts and in England, and
// `Washington` is a city in one place and a state in another.
//
// Two guards, and a row has to clear both:
//
//   1. **The country.** Every metro names the countries it can possibly be in,
//      checked against the row's own resolved `countries`. That is what keeps
//      Cambridge, MA out of the London list without either list having to know
//      the other exists.
//   2. **The state, where the city name is ambiguous.** `cities` are
//      `[city, state]` pairs and both have to appear in the same location
//      string. `open` is the per-metro list of names distinctive enough to
//      match with no state beside them (`cupertino`, `sunnyvale`, `palo alto`),
//      which is what rescues the many rows that carry a bare city.
//
// Everything here fails toward NOT MATCHING. A row whose location could not be
// read is in no metro, which costs it a place on one filter page and costs it
// nothing anywhere else — it is still in the README, still in its field
// section, still in every company and role cut. Filing it in the wrong city is
// the failure that wastes somebody's afternoon.

/** State and province names, mapped to the code the metro table uses. */
const STATE_ALIASES = new Map(Object.entries({
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI',
  'wyoming': 'WY', 'district of columbia': 'DC',
  'ontario': 'ON', 'quebec': 'QC', 'québec': 'QC', 'british columbia': 'BC',
  'alberta': 'AB', 'nova scotia': 'NS', 'manitoba': 'MB', 'saskatchewan': 'SK',
}));

const STATE_CODES = new Set([...STATE_ALIASES.values()]);

const US = ['United States'];
const CA = ['Canada'];

/**
 * The metros, in the order the hub prints them: North America first (which is
 * what the home list is about), then everywhere else.
 *
 * Keep `open` conservative. Every name on it is a name that can be matched from
 * a bare string, and the only thing standing between it and a wrong answer is
 * the country guard.
 */
export const METROS = [
  {
    id: 'bay-area', emoji: '🌉', label: 'SF Bay Area', countries: US,
    cities: [
      ['oakland', 'CA'], ['berkeley', 'CA'], ['alameda', 'CA'], ['newark', 'CA'],
      ['union city', 'CA'], ['hayward', 'CA'], ['pleasanton', 'CA'], ['san ramon', 'CA'],
      ['walnut creek', 'CA'], ['livermore', 'CA'], ['campbell', 'CA'], ['belmont', 'CA'],
      ['san carlos', 'CA'], ['daly city', 'CA'], ['brisbane', 'CA'], ['santa cruz', 'CA'],
      ['fremont', 'CA'], ['burlingame', 'CA'],
    ],
    open: ['san francisco', 'south san francisco', 'palo alto', 'menlo park', 'mountain view',
      'sunnyvale', 'cupertino', 'santa clara', 'san jose', 'redwood city', 'foster city',
      'milpitas', 'emeryville', 'san mateo', 'los altos', 'san bruno', 'sf bay area',
      'silicon valley'],
  },
  {
    id: 'seattle', emoji: '🌲', label: 'Seattle & Puget Sound', countries: US,
    cities: [['seattle', 'WA'], ['bellevue', 'WA'], ['kirkland', 'WA'], ['renton', 'WA'],
      ['bothell', 'WA'], ['everett', 'WA'], ['tacoma', 'WA']],
    open: ['seattle', 'redmond', 'issaquah', 'sammamish'],
  },
  {
    id: 'new-york', emoji: '🗽', label: 'New York City', countries: US,
    cities: [['new york', 'NY'], ['queens', 'NY'], ['newark', 'NJ'], ['stamford', 'CT']],
    open: ['new york city', 'nyc', 'manhattan', 'brooklyn', 'long island city', 'jersey city', 'hoboken'],
  },
  {
    id: 'boston', emoji: '🎓', label: 'Boston & Cambridge', countries: US,
    cities: [['boston', 'MA'], ['cambridge', 'MA'], ['waltham', 'MA'], ['burlington', 'MA'],
      ['lexington', 'MA'], ['wilmington', 'MA'], ['needham', 'MA'], ['andover', 'MA'],
      ['marlborough', 'MA'], ['leominster', 'MA'], ['quincy', 'MA'], ['bedford', 'MA'],
      ['woburn', 'MA'], ['chelmsford', 'MA']],
    open: ['somerville'],
  },
  {
    id: 'los-angeles', emoji: '🌴', label: 'Los Angeles & Orange County', countries: US,
    cities: [['pasadena', 'CA'], ['burbank', 'CA'], ['torrance', 'CA'], ['long beach', 'CA'],
      ['irvine', 'CA'], ['costa mesa', 'CA'], ['anaheim', 'CA'], ['glendale', 'CA'],
      ['redondo beach', 'CA'], ['santa ana', 'CA']],
    open: ['los angeles', 'santa monica', 'el segundo', 'culver city', 'hawthorne', 'van nuys',
      'marina del rey', 'playa vista'],
  },
  {
    id: 'san-diego', emoji: '🏖️', label: 'San Diego', countries: US,
    cities: [['carlsbad', 'CA'], ['poway', 'CA'], ['oceanside', 'CA']],
    open: ['san diego', 'la jolla'],
  },
  {
    id: 'austin', emoji: '🎸', label: 'Austin', countries: US,
    cities: [['austin', 'TX'], ['round rock', 'TX'], ['cedar park', 'TX'], ['bastrop', 'TX'],
      ['georgetown', 'TX']],
    // `Austin` with no state is Austin, TX often enough to be worth it: the ATS
    // exports in this catalog include `Austin (Ed Bluestein, Office)`, which no
    // state check can rescue. The country guard still applies.
    open: ['austin', 'pflugerville'],
  },
  {
    id: 'dallas-fort-worth', emoji: '🤠', label: 'Dallas–Fort Worth', countries: US,
    cities: [['dallas', 'TX'], ['fort worth', 'TX'], ['plano', 'TX'], ['irving', 'TX'],
      ['richardson', 'TX'], ['frisco', 'TX'], ['arlington', 'TX'], ['mckinney', 'TX'],
      ['addison', 'TX']],
    open: [],
  },
  {
    id: 'texas-other', emoji: '🛢️', label: 'Houston, San Antonio & the rest of Texas', countries: US,
    cities: [['houston', 'TX'], ['san antonio', 'TX'], ['spring', 'TX'], ['the woodlands', 'TX'],
      ['sugar land', 'TX'], ['el paso', 'TX'], ['lubbock', 'TX'], ['college station', 'TX'],
      ['richmond', 'TX']],
    open: ['houston', 'san antonio'],
  },
  {
    id: 'chicago', emoji: '🌬️', label: 'Chicago', countries: US,
    cities: [['chicago', 'IL'], ['evanston', 'IL'], ['naperville', 'IL'], ['schaumburg', 'IL'],
      ['deerfield', 'IL'], ['oak brook', 'IL'], ['northbrook', 'IL']],
    open: ['chicago'],
  },
  {
    id: 'denver-boulder', emoji: '🏔️', label: 'Denver, Boulder & Colorado', countries: US,
    cities: [['denver', 'CO'], ['boulder', 'CO'], ['broomfield', 'CO'], ['louisville', 'CO'],
      ['longmont', 'CO'], ['colorado springs', 'CO'], ['fort collins', 'CO'], ['golden', 'CO'],
      ['westminster', 'CO'], ['aurora', 'CO']],
    open: [],
  },
  {
    id: 'atlanta', emoji: '🍑', label: 'Atlanta', countries: US,
    cities: [['atlanta', 'GA'], ['alpharetta', 'GA'], ['marietta', 'GA'], ['sandy springs', 'GA'],
      ['duluth', 'GA']],
    open: [],
  },
  {
    id: 'washington-dc', emoji: '🏛️', label: 'Washington DC & Northern Virginia', countries: US,
    cities: [['washington', 'DC'], ['arlington', 'VA'], ['alexandria', 'VA'], ['reston', 'VA'],
      ['herndon', 'VA'], ['mclean', 'VA'], ['tysons', 'VA'], ['vienna', 'VA'],
      ['bethesda', 'MD'], ['rockville', 'MD'], ['college park', 'MD'], ['chantilly', 'VA'],
      ['fairfax', 'VA'], ['springfield', 'VA'], ['laurel', 'MD'], ['columbia', 'MD'],
      ['silver spring', 'MD'], ['annapolis junction', 'MD']],
    open: ['washington dc'],
  },
  {
    id: 'research-triangle', emoji: '🔺', label: 'Research Triangle & the Carolinas', countries: US,
    cities: [['raleigh', 'NC'], ['durham', 'NC'], ['chapel hill', 'NC'], ['cary', 'NC'],
      ['morrisville', 'NC'], ['charlotte', 'NC'], ['greenville', 'SC'], ['columbia', 'SC']],
    open: ['research triangle park'],
  },
  {
    id: 'phoenix', emoji: '🌵', label: 'Phoenix & Arizona', countries: US,
    cities: [['phoenix', 'AZ'], ['tempe', 'AZ'], ['chandler', 'AZ'], ['scottsdale', 'AZ'],
      ['mesa', 'AZ'], ['tucson', 'AZ'], ['gilbert', 'AZ'], ['peoria', 'AZ']],
    open: [],
  },
  {
    id: 'salt-lake-city', emoji: '🏜️', label: 'Salt Lake City & Utah', countries: US,
    cities: [['salt lake city', 'UT'], ['lehi', 'UT'], ['provo', 'UT'], ['draper', 'UT'],
      ['south jordan', 'UT'], ['sandy', 'UT'], ['ogden', 'UT']],
    open: ['salt lake city'],
  },
  {
    id: 'pacific-northwest', emoji: '🌧️', label: 'Portland & the Pacific Northwest', countries: US,
    cities: [['portland', 'OR'], ['hillsboro', 'OR'], ['beaverton', 'OR'], ['eugene', 'OR'],
      ['vancouver', 'WA'], ['spokane', 'WA'], ['boise', 'ID']],
    open: [],
  },
  {
    id: 'toronto', emoji: '🍁', label: 'Toronto, Waterloo & Ottawa', countries: CA,
    cities: [['toronto', 'ON'], ['mississauga', 'ON'], ['waterloo', 'ON'], ['kitchener', 'ON'],
      ['markham', 'ON'], ['ottawa', 'ON'], ['brampton', 'ON'], ['hamilton', 'ON'],
      ['london', 'ON']],
    open: ['toronto', 'mississauga', 'kitchener', 'brampton', 'waterloo', 'ottawa'],
  },
  {
    id: 'vancouver', emoji: '⛰️', label: 'Vancouver & British Columbia', countries: CA,
    cities: [['vancouver', 'BC'], ['burnaby', 'BC'], ['richmond', 'BC'], ['surrey', 'BC'],
      ['victoria', 'BC']],
    open: ['vancouver', 'burnaby'],
  },
  {
    id: 'montreal', emoji: '🥐', label: 'Montréal & Québec', countries: CA,
    cities: [['montreal', 'QC'], ['montréal', 'QC'], ['quebec city', 'QC'], ['laval', 'QC'],
      ['sherbrooke', 'QC']],
    open: ['montreal', 'montréal', 'quebec city'],
  },
  {
    id: 'calgary', emoji: '🐎', label: 'Calgary & the Prairies', countries: CA,
    cities: [['calgary', 'AB'], ['edmonton', 'AB'], ['winnipeg', 'MB'], ['saskatoon', 'SK'],
      ['regina', 'SK']],
    open: ['calgary', 'edmonton', 'winnipeg'],
  },
  // ── outside the United States and Canada ───────────────────────────────────
  { id: 'uk', emoji: '🇬🇧', label: 'London & the UK', countries: ['United Kingdom'], cities: [],
    open: ['london', 'manchester', 'cambridge', 'edinburgh', 'bristol', 'leeds', 'oxford',
      'birmingham', 'glasgow', 'reading', 'belfast'] },
  { id: 'france', emoji: '🇫🇷', label: 'Paris & France', countries: ['France'], cities: [],
    open: ['paris', 'lyon', 'toulouse', 'lille', 'nantes', 'bordeaux', 'marseille', 'grenoble',
      'sophia antipolis', 'rennes'] },
  { id: 'germany', emoji: '🇩🇪', label: 'Berlin, Munich & Germany', countries: ['Germany'], cities: [],
    open: ['berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'stuttgart', 'cologne', 'köln',
      'dresden', 'karlsruhe', 'düsseldorf', 'dusseldorf', 'leipzig', 'nuremberg'] },
  { id: 'ireland', emoji: '🇮🇪', label: 'Dublin & Ireland', countries: ['Ireland'], cities: [],
    open: ['dublin', 'cork', 'galway', 'limerick'] },
  { id: 'benelux', emoji: '🇳🇱', label: 'Amsterdam & the Benelux', countries: ['Netherlands', 'Belgium', 'Luxembourg'],
    cities: [], open: ['amsterdam', 'rotterdam', 'utrecht', 'eindhoven', 'the hague', 'delft',
      'brussels', 'antwerp', 'ghent', 'leuven', 'luxembourg'] },
  { id: 'switzerland', emoji: '🇨🇭', label: 'Zürich & Switzerland', countries: ['Switzerland'], cities: [],
    open: ['zurich', 'zürich', 'geneva', 'genève', 'lausanne', 'basel', 'bern', 'zug'] },
  { id: 'nordics', emoji: '❄️', label: 'Stockholm & the Nordics',
    countries: ['Sweden', 'Denmark', 'Norway', 'Finland', 'Iceland'], cities: [],
    open: ['stockholm', 'gothenburg', 'göteborg', 'malmö', 'copenhagen', 'københavn', 'oslo',
      'helsinki', 'espoo', 'aarhus', 'trondheim', 'reykjavik'] },
  { id: 'iberia', emoji: '🇪🇸', label: 'Madrid, Barcelona & Iberia', countries: ['Spain', 'Portugal'],
    cities: [], open: ['madrid', 'barcelona', 'valencia', 'seville', 'málaga', 'malaga',
      'lisbon', 'lisboa', 'porto', 'braga'] },
  { id: 'poland-cee', emoji: '🏰', label: 'Warsaw, Kraków & Central Europe',
    countries: ['Poland', 'Czechia', 'Czech Republic', 'Romania', 'Hungary', 'Bulgaria', 'Estonia', 'Lithuania', 'Latvia'],
    cities: [], open: ['warsaw', 'warszawa', 'kraków', 'krakow', 'wrocław', 'wroclaw', 'gdańsk',
      'gdansk', 'poznań', 'poznan', 'prague', 'praha', 'brno', 'bucharest', 'cluj', 'budapest',
      'sofia', 'tallinn', 'vilnius', 'riga'] },
  { id: 'india', emoji: '🇮🇳', label: 'Bengaluru & India', countries: ['India'], cities: [],
    open: ['bangalore', 'bengaluru', 'hyderabad', 'pune', 'chennai', 'gurgaon', 'gurugram',
      'noida', 'mumbai', 'delhi', 'new delhi', 'kolkata', 'ahmedabad'] },
  { id: 'singapore', emoji: '🇸🇬', label: 'Singapore', countries: ['Singapore'], cities: [], open: ['singapore'] },
  { id: 'japan', emoji: '🇯🇵', label: 'Tokyo & Japan', countries: ['Japan'], cities: [],
    open: ['tokyo', 'osaka', 'kyoto', 'yokohama', 'nagoya', 'fukuoka'] },
  { id: 'greater-china', emoji: '🏮', label: 'Beijing, Shanghai, Taipei & Hong Kong',
    countries: ['China', 'Taiwan', 'Hong Kong'], cities: [],
    open: ['beijing', 'shanghai', 'shenzhen', 'hangzhou', 'guangzhou', 'taipei', 'hsinchu',
      'hong kong', 'chengdu', 'nanjing', 'suzhou', 'wuhan', 'xi\'an'] },
  { id: 'korea', emoji: '🇰🇷', label: 'Seoul & Korea', countries: ['South Korea', 'Korea'], cities: [],
    open: ['seoul', 'suwon', 'incheon', 'busan', 'pangyo', 'seongnam'] },
  { id: 'anz', emoji: '🇦🇺', label: 'Sydney, Melbourne & Aotearoa', countries: ['Australia', 'New Zealand'],
    cities: [], open: ['sydney', 'melbourne', 'brisbane', 'perth', 'canberra', 'adelaide',
      'auckland', 'wellington', 'christchurch'] },
  { id: 'israel', emoji: '🇮🇱', label: 'Tel Aviv & Israel', countries: ['Israel'], cities: [],
    open: ['tel aviv', 'herzliya', 'haifa', 'jerusalem', 'ra\'anana', 'raanana', 'petah tikva'] },
  { id: 'latam', emoji: '🌎', label: 'México, Brazil & Latin America',
    countries: ['Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Uruguay', 'Costa Rica'],
    cities: [], open: ['mexico city', 'ciudad de méxico', 'cdmx', 'guadalajara', 'monterrey',
      'são paulo', 'sao paulo', 'rio de janeiro', 'belo horizonte', 'florianópolis',
      'buenos aires', 'bogotá', 'bogota', 'medellín', 'medellin', 'santiago', 'lima',
      'montevideo', 'san josé'] },
  { id: 'mena-africa', emoji: '🌍', label: 'Dubai, Cairo, Lagos & Africa',
    countries: ['United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Nigeria', 'Kenya', 'South Africa',
      'Morocco', 'Ghana', 'Türkiye', 'Turkey'],
    cities: [], open: ['dubai', 'abu dhabi', 'riyadh', 'cairo', 'lagos', 'nairobi', 'cape town',
      'johannesburg', 'casablanca', 'accra', 'istanbul', 'ankara'] },
];

/** Strips ATS site codes and collapses whitespace, like the Location cell does. */
function tidy(value) {
  return String(value ?? '')
    .replace(/\s*\([A-Z0-9][A-Z0-9\s-]{3,}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One location string as `{ parts, states }`.
 *
 * `parts` are the comma-separated pieces, lowercased — which is what makes
 * `US,CA,San Jose` and `San Jose, CA, US` the same input. `states` are every
 * state or province the string names, by code.
 */
export function readLocation(value) {
  const text = tidy(value).toLowerCase();
  if (!text) return { parts: [], states: new Set() };
  const parts = text.split(/[,/]|\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  const states = new Set();
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (upper.length === 2 && STATE_CODES.has(upper)) states.add(upper);
    const named = STATE_ALIASES.get(part);
    // `washington` is a state name AND a city name, and the city is in DC. Only
    // the full name in a comma-part of its own is read as the state, and that
    // one is excluded — so `Washington, DC` keeps its DC and `Redmond, WA`
    // keeps its WA.
    if (named && part !== 'washington') states.add(named);
  }
  return { parts, states };
}

/** True when one comma-part IS this city, or opens with it. */
function hasPart(parts, city) {
  return parts.some((part) => part === city || part.startsWith(`${city} `) || part.startsWith(`${city}(`));
}

function placedBy(metro, read) {
  if ((metro.open ?? []).some((city) => hasPart(read.parts, city))) return true;
  return (metro.cities ?? []).some(([city, state]) => hasPart(read.parts, city) && read.states.has(state));
}

/**
 * Every metro a row belongs to.
 *
 * A posting open in two metros is in both lists, which is the honest answer —
 * the same role really is available in both places, and picking one would hide
 * it from half the people it is open to.
 *
 * A row whose country the catalog could not resolve matches NOTHING, because
 * the country is the guard that keeps Cambridge, MA out of the London list. It
 * is a row we cannot place, not a row that is nowhere.
 */
export function metrosOf(job) {
  const countries = new Set((job.countries ?? []).filter(Boolean));
  const reads = [...(job.cities ?? []), ...(job.locations ?? [])]
    .map((value) => readLocation(value))
    .filter((read) => read.parts.length);
  if (!reads.length) return [];
  const hits = [];
  for (const metro of METROS) {
    if (!metro.countries.some((country) => countries.has(country))) continue;
    if (reads.some((read) => placedBy(metro, read))) hits.push(metro.id);
  }
  return hits;
}
