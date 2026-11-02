import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { q } from "./db";
import { Candidate, chGet, normaliseCompanyNumber, normaliseName, publicUrl, searchCompanies } from "./companiesHouse";
import { ownershipFromNatures, parseOfficerName } from "./people";
import { sicLabel } from "./sic";

const anthropic = new Anthropic();

const MatchSchema = z.object({
  company_number: z.string().describe('The chosen candidate\'s number, or "none" if no candidate fits'),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().describe("One short sentence explaining the choice"),
});

async function pickWithHaiku(row: any, candidates: Candidate[]) {
  const res = await anthropic.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 2000,
    system:
      "You match a UK company name from a user's target list to Companies House search results. " +
      'Choose only from the candidates given, or answer "none". Use "high" only when the name is clearly the same business ' +
      "(minor wording differences such as Ltd/Limited or a trading style are fine). Prefer active companies over dissolved ones of the same name. " +
      "Any website, owner or email hints are there to help you tell similar names apart.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          target: { name: row.csv_name, website: row.csv_website, owner: row.csv_owner, email: row.csv_email },
          candidates,
        }),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
  });
  return res.parsed_output;
}

type Fact = { key: string; label: string; value: string; url: string | null; safe: boolean; type?: string };

const humanise = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function yearsSince(date: string) {
  const from = new Date(date);
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  if (now < new Date(now.getFullYear(), from.getMonth(), from.getDate())) years -= 1;
  return years;
}

export async function enrichCompany(row: any, number: string, match: { method: string; confidence?: string | null; reason?: string | null }) {
  const profile = await chGet<any>(`/company/${number}`);
  if (!profile) {
    await setStatus(row.id, "error", `Company number ${number} was not found at Companies House`);
    return;
  }
  const officers = await chGet<any>(`/company/${number}/officers?items_per_page=100`);
  const psc = await chGet<any>(`/company/${number}/persons-with-significant-control?items_per_page=100`);

  const url = publicUrl(number);
  const facts: Fact[] = [
    { key: "company_name", label: "Registered name", value: profile.company_name, url, safe: true },
    { key: "company_number", label: "Company number", value: number, url, safe: true },
    { key: "status", label: "Status", value: humanise(profile.company_status ?? "unknown"), url, safe: false },
  ];
  if (profile.company_status_detail)
    facts.push({ key: "status_detail", label: "Status detail", value: humanise(profile.company_status_detail), url, safe: false });
  if (profile.date_of_creation) {
    facts.push({ key: "incorporation_date", label: "Incorporated", value: profile.date_of_creation, url, safe: true });
    facts.push({ key: "years_trading", label: "Years since incorporation", value: String(yearsSince(profile.date_of_creation)), url, safe: true });
  }
  if (profile.sic_codes?.length)
    facts.push({
      key: "sic_codes",
      label: "SIC codes",
      value: profile.sic_codes.map((c: string) => `${c} ${sicLabel(c)}`).join("; "),
      url,
      safe: true,
    });
  const a = profile.registered_office_address;
  if (a) {
    const value = [a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code].filter(Boolean).join(", ");
    facts.push({ key: "address", label: "Registered office", value, url, safe: true });
  }
  const accounts = profile.accounts;
  if (accounts?.last_accounts?.type)
    facts.push({ key: "accounts_type", label: "Last accounts type", value: humanise(accounts.last_accounts.type), url: publicUrl(number, "/filing-history"), safe: false });
  if (accounts?.last_accounts?.made_up_to)
    facts.push({ key: "accounts_made_up_to", label: "Accounts made up to", value: accounts.last_accounts.made_up_to, url: publicUrl(number, "/filing-history"), safe: false });
  if (accounts?.overdue)
    facts.push({ key: "accounts_overdue", label: "Accounts overdue", value: "Yes", url, safe: false });
  if (profile.has_insolvency_history)
    facts.push({ key: "insolvency_history", label: "Insolvency history", value: "Yes", url: publicUrl(number, "/insolvency"), safe: false });
  if (a?.locality)
    facts.push({ key: "town", label: "Town", value: a.locality, url, safe: true });
  const lastCeased = (psc?.items ?? []).map((p: any) => p.ceased_on).filter(Boolean).sort().pop();
  if (lastCeased)
    facts.push({ key: "control_last_changed", label: "Last controlling person left", value: lastCeased, url: publicUrl(number, "/persons-with-significant-control"), safe: false });
  if (row.csv_website)
    facts.push({ key: "website", label: "Website", value: row.csv_website, url: null, safe: true, type: "csv" });
  if (row.csv_owner)
    facts.push({ key: "csv_owner", label: "Owner (from your CSV)", value: row.csv_owner, url: null, safe: true, type: "csv" });
  if (row.csv_email)
    facts.push({ key: "csv_email", label: "Email (from your CSV)", value: row.csv_email, url: null, safe: false, type: "csv" });

  await q("DELETE FROM facts WHERE company_id=$1 AND source_type <> 'website'", [row.id]);
  await q("DELETE FROM people WHERE company_id=$1", [row.id]);
  for (const f of facts) {
    await q(
      `INSERT INTO facts (company_id,key,label,value,source_type,source_url,letter_safe) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (company_id,key) DO UPDATE SET label=$3,value=$4,source_type=$5,source_url=$6,letter_safe=$7,fetched_at=now()`,
      [row.id, f.key, f.label, f.value, f.type ?? "companies_house", f.url, f.safe],
    );
  }

  for (const o of officers?.items ?? []) {
    if (o.resigned_on || !String(o.officer_role ?? "").includes("director")) continue;
    if (String(o.officer_role).startsWith("corporate")) continue;
    const n = parseOfficerName(o.name ?? "");
    await insertPerson(row.id, "director", { ...n, title: o.name_elements?.title ?? n.title }, null, null, o.date_of_birth, publicUrl(number, "/officers"));
  }
  for (const p of psc?.items ?? []) {
    if (p.ceased_on || p.ceased) continue;
    const own = ownershipFromNatures(p.natures_of_control);
    const pscUrl = publicUrl(number, "/persons-with-significant-control");
    if (String(p.kind ?? "").startsWith("individual")) {
      const e = p.name_elements ?? {};
      const forename = [e.forename, e.middle_name].filter(Boolean).join(" ");
      const name = [forename, e.surname].filter(Boolean).join(" ") || p.name;
      await insertPerson(row.id, "psc", { name, title: e.title ?? null, forename: forename || null, surname: e.surname ?? null }, own.band, own.min, p.date_of_birth, pscUrl);
    } else if (String(p.kind ?? "").includes("corporate") || String(p.kind ?? "").includes("legal")) {
      await insertPerson(row.id, "corporate_psc", { name: p.name, title: null, forename: null, surname: null }, own.band, own.min, null, pscUrl);
    }
  }

  await q(
    `UPDATE companies SET status='enriched', status_note=NULL, company_number=$2, company_name=$3, match_method=$4, match_confidence=$5,
       match_reason=$6, website=COALESCE(website,csv_website), updated_at=now() WHERE id=$1`,
    [row.id, number, profile.company_name, match.method, match.confidence ?? null, match.reason ?? null],
  );
}

async function insertPerson(
  companyId: number,
  kind: string,
  n: { name: string; title: string | null; forename: string | null; surname: string | null },
  band: string | null,
  min: number | null,
  dob: { year?: number; month?: number } | null | undefined,
  url: string,
) {
  await q(
    `INSERT INTO people (company_id,kind,name,title,forename,surname,ownership_band,ownership_min,dob_year,dob_month,source_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [companyId, kind, n.name, n.title, n.forename, n.surname, band, min, dob?.year ?? null, dob?.month ?? null, url],
  );
}

async function setStatus(id: number, status: string, note: string | null) {
  await q("UPDATE companies SET status=$2, status_note=$3, updated_at=now() WHERE id=$1", [id, status, note]);
}

export async function processRow(row: any) {
  try {
    if (row.csv_number) {
      const number = normaliseCompanyNumber(row.csv_number);
      if (!number) return setStatus(row.id, "error", `"${row.csv_number}" is not a valid company number`);
      await enrichCompany(row, number, { method: "number", reason: "Company number supplied in the CSV" });
      const [saved] = await q("SELECT company_name,status FROM companies WHERE id=$1", [row.id]);
      if (saved?.status === "enriched" && normaliseName(saved.company_name) !== normaliseName(row.csv_name))
        await q("UPDATE companies SET status_note=$2 WHERE id=$1", [row.id, `CSV says "${row.csv_name}" but this number is registered to "${saved.company_name}"`]);
      return;
    }

    const candidates = await searchCompanies(row.csv_name);
    if (!candidates.length) return setStatus(row.id, "no_match", "Companies House returned no results for this name");

    const target = normaliseName(row.csv_name);
    const exactActive = candidates.filter((c) => normaliseName(c.title) === target && c.status === "active");
    if (exactActive.length === 1)
      return await enrichCompany(row, exactActive[0].number, { method: "exact", confidence: "high", reason: "Exact name match on an active company" });

    const pick = await pickWithHaiku(row, candidates);
    const chosen = candidates.find((c) => c.number === pick?.company_number);
    if (chosen && pick?.confidence === "high")
      return await enrichCompany(row, chosen.number, { method: "haiku", confidence: pick.confidence, reason: pick.reason });

    if (pick?.company_number === "none" && pick.confidence === "high")
      return setStatus(row.id, "no_match", pick.reason);

    // Anything short of a confident, valid pick goes to the user, including a model answer outside the candidate list.
    await q(
      `UPDATE companies SET status='needs_confirm', candidates=$2, suggested_number=$3, match_confidence=$4, match_reason=$5, updated_at=now() WHERE id=$1`,
      [row.id, JSON.stringify(candidates), chosen?.number ?? null, pick?.confidence ?? "low", pick?.reason ?? "The model did not return a usable answer"],
    );
  } catch (err) {
    await setStatus(row.id, "error", err instanceof Error ? err.message : "Unexpected error");
  }
}
