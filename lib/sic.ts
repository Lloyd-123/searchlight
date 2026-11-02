import sicCodes from "./sicCodes.json";

// SIC 2007 divisions: broad groups a user can pick to match every code starting with those two digits.
// Individual codes come from sicCodes.json, generated from Companies House's api-enumerations list.
const DIVISIONS: Record<string, string> = {
  "01": "Agriculture", "02": "Forestry", "03": "Fishing", "05": "Coal mining", "06": "Oil and gas extraction",
  "07": "Metal ore mining", "08": "Quarrying and mining", "09": "Mining support services", "10": "Food manufacturing",
  "11": "Beverage manufacturing", "12": "Tobacco manufacturing", "13": "Textile manufacturing", "14": "Clothing manufacturing",
  "15": "Leather goods manufacturing", "16": "Wood products manufacturing", "17": "Paper manufacturing",
  "18": "Printing and reproduction", "19": "Coke and refined petroleum", "20": "Chemical manufacturing",
  "21": "Pharmaceutical manufacturing", "22": "Rubber and plastics manufacturing", "23": "Non-metallic mineral products",
  "24": "Basic metals manufacturing", "25": "Fabricated metal products", "26": "Computer and electronic products",
  "27": "Electrical equipment manufacturing", "28": "Machinery manufacturing", "29": "Motor vehicle manufacturing",
  "30": "Other transport equipment", "31": "Furniture manufacturing", "32": "Other manufacturing",
  "33": "Machinery repair and installation", "35": "Electricity and gas supply", "36": "Water supply",
  "37": "Sewerage", "38": "Waste collection and recycling", "39": "Remediation services", "41": "Building construction",
  "42": "Civil engineering", "43": "Specialised construction", "45": "Motor vehicle sales and repair", "46": "Wholesale trade",
  "47": "Retail trade", "49": "Land transport", "50": "Water transport", "51": "Air transport",
  "52": "Warehousing and transport support", "53": "Postal and courier services", "55": "Accommodation",
  "56": "Food and drink services", "58": "Publishing", "59": "Film, video and sound production", "60": "Broadcasting",
  "61": "Telecommunications", "62": "Software and IT services", "63": "Information services", "64": "Financial services",
  "65": "Insurance and pensions", "66": "Financial and insurance support", "68": "Real estate", "69": "Legal and accounting",
  "70": "Management consultancy", "71": "Architecture and engineering", "72": "Scientific research", "73": "Advertising and market research",
  "74": "Professional and technical services", "75": "Veterinary services", "77": "Rental and leasing", "78": "Employment services",
  "79": "Travel services", "80": "Security services", "81": "Building and landscape services", "82": "Business support services",
  "84": "Public administration", "85": "Education", "86": "Healthcare", "87": "Residential care", "88": "Social work",
  "90": "Creative arts", "91": "Libraries and museums", "92": "Gambling", "93": "Sports and recreation",
  "94": "Membership organisations", "95": "Repair of goods", "96": "Personal services", "98": "Household production", "99": "Extraterritorial bodies",
};

const CODES = sicCodes as Record<string, string>;

export const sicLabel = (code: string) =>
  CODES[code] ?? (code.length === 2 ? DIVISIONS[code] : undefined) ?? DIVISIONS[code.slice(0, 2)] ?? "Unknown sector";
export const extractSicCodes = (value: string) => value.match(/\b\d{5}\b/g) ?? [];
export const isSicCode = (code: string) => code in CODES;
export const allSicLines = () => Object.entries(CODES).map(([code, label]) => `${code} ${label}`).join("\n");

export type SectorMatch = { code: string; label: string; isGroup: boolean };

// Each search word must start a word in the description, so "plumb" finds plumbing and "art" doesn't find "party".
export function searchSectors(query: string, limit = 12): SectorMatch[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (code: string, label: string) => {
    const words = `${code} ${label}`.toLowerCase().split(/[^a-z0-9]+/);
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  };
  const groups = Object.entries(DIVISIONS)
    .filter(([code, label]) => matches(code, label))
    .map(([code, label]) => ({ code, label, isGroup: true }));
  const codes = Object.entries(CODES)
    .filter(([code, label]) => matches(code, label))
    .map(([code, label]) => ({ code, label, isGroup: false }));
  return [...groups, ...codes].slice(0, limit);
}
