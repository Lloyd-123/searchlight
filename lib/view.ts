import { q } from "./db";
import { ageBand, ageOf, pickOwner, PersonRow } from "./people";
import { DETAIL_PREFIX } from "./website";

export async function loadCompanies() {
  const [companies, facts, people, checks, letters] = await Promise.all([
    q("SELECT * FROM companies ORDER BY id"),
    q("SELECT * FROM facts ORDER BY id"),
    q("SELECT * FROM people ORDER BY id"),
    q("SELECT * FROM website_checks ORDER BY id"),
    q("SELECT * FROM letters"),
  ]);
  return companies.map((c) => {
    const ps = people.filter((p) => p.company_id === c.id) as unknown as PersonRow[];
    return {
      row: c,
      facts: facts.filter((f) => f.company_id === c.id),
      people: ps,
      owner: pickOwner(ps, c.csv_owner),
      checks: checks.filter((w) => w.company_id === c.id),
      letter: letters.find((l) => l.company_id === c.id) ?? null,
    };
  });
}

export type LoadedCompany = Awaited<ReturnType<typeof loadCompanies>>[number];

// What the browser receives. Dates of birth stop here: people carry an age band only.
export function toClient(c: LoadedCompany) {
  const { row } = c;
  const { age: _age, ...owner } = c.owner ?? ({} as any);
  return {
    id: row.id,
    csvName: row.csv_name,
    status: row.status,
    statusNote: row.status_note,
    matchMethod: row.match_method,
    matchConfidence: row.match_confidence,
    matchReason: row.match_reason,
    candidates: row.candidates,
    suggestedNumber: row.suggested_number,
    companyNumber: row.company_number,
    companyName: row.company_name,
    website: row.website,
    websiteStatus: row.website_status,
    websiteNote: row.website_note,
    selected: row.selected,
    contactedAt: row.contacted_at,
    facts: c.facts.map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      sourceType: f.source_type,
      sourceUrl: f.source_url,
      letterSafe: f.letter_safe,
    })),
    people: c.people.map((p) => ({
      kind: p.kind,
      name: p.name,
      ownershipBand: p.ownership_band,
      ageBand: p.kind === "corporate_psc" ? null : ageBand(ageOf(p)),
      sourceUrl: p.source_url,
    })),
    owner: c.owner ? owner : null,
    checks: c.checks
      .filter((w) => !w.criterion.startsWith(DETAIL_PREFIX))
      .map((w) => ({ criterion: w.criterion, answer: w.answer, snippet: w.snippet, sourceUrl: w.source_url, note: w.note })),
    details: c.checks
      .filter((w) => w.criterion.startsWith(DETAIL_PREFIX))
      .map((w) => ({ topic: w.note, snippet: w.snippet, sourceUrl: w.source_url })),
    letter: c.letter
      ? { subject: c.letter.subject, body: c.letter.body, note: c.letter.note, claims: c.letter.claims, status: c.letter.validation_status }
      : null,
  };
}
