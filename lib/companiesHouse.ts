// Companies House allows 600 requests per 5 minutes per key, i.e. one every 500ms.
const MIN_GAP_MS = 520;
const BASE = "https://api.company-information.service.gov.uk";

const g = globalThis as unknown as { chNextSlot?: number };

async function waitForSlot() {
  const now = Date.now();
  const slot = Math.max(now, g.chNextSlot ?? 0);
  g.chNextSlot = slot + MIN_GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

export class ChError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Returns null on 404, because a missing PSC or officer list is a normal answer.
export async function chGet<T = any>(path: string): Promise<T | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new ChError(0, "COMPANIES_HOUSE_API_KEY is not set");
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForSlot();
    const res = await fetch(BASE + path, {
      headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64") },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return null;
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const waitMs = Math.min(reset ? Math.max(reset - Date.now(), 1000) : 10000, 60000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status === 401) throw new ChError(401, "Companies House rejected the API key");
    if (!res.ok) throw new ChError(res.status, `Companies House returned ${res.status}`);
    return (await res.json()) as T;
  }
  throw new ChError(429, "Companies House rate limit: still limited after retries");
}

export const publicUrl = (number: string, sub = "") =>
  `https://find-and-update.company-information.service.gov.uk/company/${number}${sub}`;

export type Candidate = {
  number: string;
  title: string;
  status: string;
  created: string | null;
  address: string | null;
  type: string | null;
};

export async function searchCompanies(name: string): Promise<Candidate[]> {
  const data = await chGet<any>(`/search/companies?items_per_page=10&q=${encodeURIComponent(name)}`);
  return (data?.items ?? []).map((i: any) => ({
    number: i.company_number,
    title: i.title,
    status: i.company_status ?? "unknown",
    created: i.date_of_creation ?? null,
    address: i.address_snippet ?? null,
    type: i.company_type ?? null,
  }));
}

// Excel strips leading zeros, so 1234567 and SC12345 need padding back to 8 characters.
export function normaliseCompanyNumber(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  const m = v.match(/^([A-Z]{1,2})?(\d{1,8})$/);
  if (!m) return null;
  const prefix = m[1] ?? "";
  return prefix + m[2].padStart(8 - prefix.length, "0");
}

export function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(limited|ltd|plc|llp|lp|cyf|cyfyngedig)\b/g, " ")
    .replace(/^\s*the\s+/, " ")
    .replace(/\s+/g, " ")
    .trim();
}
