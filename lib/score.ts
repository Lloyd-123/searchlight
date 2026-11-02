import { extractSicCodes, sicLabel } from "./sic";
import type { LoadedCompany } from "./view";

export type Thesis = {
  sicCodes: string[];
  minCompanyAge: number | null;
  minOwnerAge: number | null;
  maxOwnerAge: number | null;
  excludeMicro: boolean;
  activeOnly: boolean;
  excludeAcquired: boolean;
};

export const DEFAULT_THESIS: Thesis = {
  sicCodes: [],
  minCompanyAge: null,
  minOwnerAge: null,
  maxOwnerAge: null,
  excludeMicro: false,
  activeOnly: true,
  excludeAcquired: false,
};

const RECENT_CHANGE_YEARS = 3;

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

const factor = (name: string, max: number, result: Factor["result"], detail: string, isFilter = false): Factor => ({
  name,
  max,
  result,
  detail,
  isFilter,
  // Missing data is neither a pass nor a fail, so it earns half the points and is labelled.
  points: result === "pass" ? max : result === "unknown" ? max / 2 : 0,
});

export function scoreCompany(c: LoadedCompany, thesis: Thesis): Score {
  const fact = (key: string) => c.facts.find((f) => f.key === key)?.value;
  const factors: Factor[] = [];
  const knockouts: string[] = [];

  if (thesis.activeOnly) {
    const status = fact("status");
    if (status && status !== "Active") knockouts.push(`Company status is ${status}`);
    if (fact("status_detail")) knockouts.push(`Status detail: ${fact("status_detail")}`);
    if (fact("insolvency_history")) knockouts.push("Has insolvency history");
  }

  if (thesis.sicCodes.length) {
    const codes = extractSicCodes(fact("sic_codes") ?? "");
    const hit = codes.find((code) => thesis.sicCodes.some((t) => code.startsWith(t)));
    factors.push(
      !codes.length
        ? factor("Sector", 30, "unknown", "No SIC codes on file", true)
        : hit
          ? factor("Sector", 30, "pass", `${hit} (${sicLabel(hit)}) is in your target list`, true)
          : factor("Sector", 30, "fail", `${codes.map((s) => `${s} (${sicLabel(s)})`).join(", ")} not in your target list`, true),
    );
  }

  if (thesis.minCompanyAge !== null) {
    const raw = fact("years_trading");
    const years = raw === undefined ? null : Number(raw);
    factors.push(
      years === null
        ? factor("Company age", 30, "unknown", "No incorporation date on file", true)
        : years >= thesis.minCompanyAge
          ? factor("Company age", 30, "pass", `${years} years, minimum is ${thesis.minCompanyAge}`, true)
          : factor("Company age", 30, "fail", `${years} years, minimum is ${thesis.minCompanyAge}`, true),
    );
  }

  if (thesis.minOwnerAge !== null || thesis.maxOwnerAge !== null) {
    const o = c.owner;
    const min = thesis.minOwnerAge;
    const max = thesis.maxOwnerAge;
    const window = min !== null && max !== null ? `your window is ${min}–${max}` : min !== null ? `minimum is ${min}` : `maximum is ${max}`;
    const inWindow = o?.age != null && (min === null || o.age >= min) && (max === null || o.age <= max);
    factors.push(
      !o || o.age === null
        ? factor("Owner age", 30, "unknown", o ? `No date of birth on file for ${o.name}` : "No owner identified", true)
        : inWindow
          ? factor("Owner age", 30, "pass", `${o.name} is in the ${o.ageBand} band, ${window}. ${o.basis}`, true)
          : factor("Owner age", 30, "fail", `${o.name} is in the ${o.ageBand} band, outside: ${window}. ${o.basis}`, true),
    );
  }

  const topPsc = [...c.people].filter((p) => p.kind !== "director").sort((a, b) => (b.ownership_min ?? 0) - (a.ownership_min ?? 0))[0];
  factors.push(
    !topPsc
      ? factor("Ownership", 10, "unknown", "No PSC listed, so ownership is not clear")
      : topPsc.kind === "corporate_psc"
        ? factor("Ownership", 10, "fail", `Controlled by another company: ${topPsc.name}`)
        : (topPsc.ownership_min ?? 0) >= 50
          ? factor("Ownership", 10, "pass", `${topPsc.name} holds ${topPsc.ownership_band}`)
          : factor("Ownership", 10, "unknown", `Largest individual PSC is ${topPsc.name}${topPsc.ownership_band ? ` with ${topPsc.ownership_band}` : ""}, no clear majority`),
  );

  const accounts = fact("accounts_type");

  // Companies House has no "acquired" flag, so this reports the signals that usually mean a sale or merger has happened.
  const signals: string[] = [];
  const parent = c.people.find((p) => p.kind === "corporate_psc" && (p.ownership_min ?? 0) >= 50);
  if (parent) signals.push(`controlled by another company, ${parent.name}`);
  if (accounts && /subsidiary/i.test(accounts)) signals.push(`files accounts as a subsidiary (${accounts})`);
  const lastChange = fact("control_last_changed");
  if (lastChange) {
    const yearsAgo = (Date.now() - new Date(lastChange).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (yearsAgo < RECENT_CHANGE_YEARS) signals.push(`a controlling person left the register on ${lastChange}`);
  }
  factors.push(
    signals.length
      ? factor("Independence", 10, "fail", `Possibly acquired or merged: ${signals.join("; ")}`, thesis.excludeAcquired)
      : factor("Independence", 10, "pass", `No sign of a sale or merger: no corporate parent, no subsidiary accounts, no control change in ${RECENT_CHANGE_YEARS} years`, thesis.excludeAcquired),
  );

  const tiny = accounts ? /micro|dormant/i.test(accounts) : false;
  factors.push(
    !accounts
      ? factor("Size signal", 10, "unknown", "No accounts type on file", thesis.excludeMicro)
      : tiny
        ? factor("Size signal", 10, "fail", `Last accounts filed as: ${accounts}`, thesis.excludeMicro)
        : factor("Size signal", 10, "pass", `Last accounts filed as: ${accounts}`, thesis.excludeMicro),
  );

  const earned = factors.reduce((sum, f) => sum + f.points, 0);
  const possible = factors.reduce((sum, f) => sum + f.max, 0);
  const filteredBecause = [
    ...knockouts,
    ...factors.filter((f) => f.isFilter && f.result === "fail").map((f) => `${f.name}: ${f.detail}`),
  ];

  return {
    total: possible ? Math.round((earned / possible) * 100) : 0,
    factors,
    knockouts,
    shortlisted: c.row.status === "enriched" && filteredBecause.length === 0,
    filteredBecause,
  };
}
