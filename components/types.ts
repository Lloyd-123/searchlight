export type Candidate = {
  number: string;
  title: string;
  status: string;
  created: string | null;
  address: string | null;
};

export type Factor = {
  name: string;
  points: number;
  max: number;
  result: "pass" | "fail" | "unknown";
  detail: string;
  isFilter: boolean;
};

export type Score = {
  total: number;
  factors: Factor[];
  knockouts: string[];
  shortlisted: boolean;
  filteredBecause: string[];
};

export type Thesis = {
  sicCodes: string[];
  minCompanyAge: number | null;
  minOwnerAge: number | null;
  maxOwnerAge: number | null;
  excludeMicro: boolean;
  activeOnly: boolean;
  excludeAcquired: boolean;
};

export type Template = { id: number; name: string; subject: string; body: string };

export type Generated = {
  subject: string;
  body: string;
  note: string | null;
  missing: string[];
  claims: Claim[];
  status: "passed" | "flagged";
};

export type Claim = {
  quote: string;
  supported: boolean;
  reason: string;
  located: boolean;
  facts: { id: string; label: string; value: string; sourceUrl: string | null }[];
};

export type Operator = { name?: string; fund?: string; background?: string; whyBuying?: string; contact?: string };

export type Company = {
  checks: { criterion: string; answer: "yes" | "no" | "unclear"; snippet: string | null; sourceUrl: string | null; note: string | null }[];
  details: { topic: string; snippet: string; sourceUrl: string | null }[];
  letter: { subject: string | null; body: string; note: string | null; claims: Claim[] | null; status: "unvalidated" | "passed" | "flagged" } | null;
  score: Score;
  id: number;
  csvName: string;
  status: "pending" | "processing" | "enriched" | "needs_confirm" | "no_match" | "error";
  statusNote: string | null;
  matchMethod: string | null;
  matchConfidence: string | null;
  matchReason: string | null;
  candidates: Candidate[] | null;
  suggestedNumber: string | null;
  companyNumber: string | null;
  companyName: string | null;
  website: string | null;
  websiteStatus: string | null;
  websiteNote: string | null;
  selected: boolean;
  contactedAt: string | null;
  facts: { key: string; label: string; value: string; sourceType: string; sourceUrl: string | null; letterSafe: boolean }[];
  people: { kind: string; name: string; ownershipBand: string | null; ageBand: string | null; sourceUrl: string | null }[];
  owner: { name: string; salutation: string; ageBand: string; basis: string; sourceUrl: string | null } | null;
};
