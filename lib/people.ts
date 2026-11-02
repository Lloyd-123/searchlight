export type PersonRow = {
  kind: "psc" | "director" | "corporate_psc";
  name: string;
  title: string | null;
  forename: string | null;
  surname: string | null;
  ownership_band: string | null;
  ownership_min: number | null;
  dob_year: number | null;
  dob_month: number | null;
  source_url: string | null;
};

export type Owner = {
  name: string;
  salutation: string;
  ageBand: string;
  age: number | null;
  basis: string;
  sourceUrl: string | null;
};

// Companies House only publishes month and year of birth. This stays server-side: the UI gets the band.
export function ageOf(p: Pick<PersonRow, "dob_year" | "dob_month">, now = new Date()): number | null {
  if (!p.dob_year) return null;
  let age = now.getFullYear() - p.dob_year;
  if (p.dob_month && now.getMonth() + 1 < p.dob_month) age -= 1;
  return age;
}

export function ageBand(age: number | null): string {
  if (age === null) return "Unknown";
  if (age < 40) return "Under 40";
  if (age >= 70) return "70+";
  const low = Math.floor(age / 5) * 5;
  return `${low}–${low + 4}`;
}

function salutationFor(p: PersonRow): string {
  const first = p.forename?.split(/\s+/)[0];
  // "Sir" and "Dame" take the first name: Sir William, never Sir Timpson.
  if (first && p.title && /^(sir|dame|lord|lady)$/i.test(p.title)) return `${p.title} ${first}`;
  if (p.title && p.surname) return `${p.title} ${p.surname}`;
  return first && p.surname ? `${first} ${p.surname}` : p.name;
}

const byOldest = (a: PersonRow, b: PersonRow) => (ageOf(b) ?? -1) - (ageOf(a) ?? -1);

// Priority: the CSV's named owner if Companies House lists them, then the largest individual PSC, then the oldest director.
export function pickOwner(people: PersonRow[], csvOwner?: string | null): Owner | null {
  const humans = people.filter((p) => p.kind !== "corporate_psc");
  const pscs = humans.filter((p) => p.kind === "psc");
  const directors = humans.filter((p) => p.kind === "director");

  const csvSurname = csvOwner?.trim().split(/\s+/).pop()?.toLowerCase();
  const named = csvSurname
    ? [...pscs, ...directors].find((p) => p.surname?.toLowerCase() === csvSurname)
    : undefined;

  let chosen: PersonRow | undefined;
  let basis = "";
  if (named) {
    chosen = named;
    basis = `Named in your CSV and listed as a ${named.kind === "psc" ? "PSC" : "director"}`;
  } else if (pscs.length) {
    chosen = [...pscs].sort((a, b) => (b.ownership_min ?? 0) - (a.ownership_min ?? 0) || byOldest(a, b))[0];
    basis = chosen.ownership_band ? `Largest PSC (${chosen.ownership_band})` : "PSC";
  } else if (directors.length) {
    chosen = [...directors].sort(byOldest)[0];
    basis = "No individual PSC listed: oldest active director";
  }
  if (!chosen) return null;

  const age = ageOf(chosen);
  return {
    name: chosen.name,
    salutation: salutationFor(chosen),
    ageBand: ageBand(age),
    age,
    basis,
    sourceUrl: chosen.source_url,
  };
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());

// Officer names arrive as "SMITH, John David, Dr".
export function parseOfficerName(raw: string) {
  const [surnameRaw = "", restRaw = "", titleRaw = ""] = raw.split(",").map((s) => s.trim());
  const surname = titleCase(surnameRaw);
  const forename = restRaw ? titleCase(restRaw) : "";
  return {
    name: [forename, surname].filter(Boolean).join(" "),
    forename: forename || null,
    surname: surname || null,
    title: titleRaw ? titleCase(titleRaw) : null,
  };
}

export function ownershipFromNatures(natures: string[] = []): { band: string | null; min: number | null } {
  const joined = natures.join(" ");
  if (joined.includes("75-to-100")) return { band: "75–100% of shares", min: 75 };
  if (joined.includes("50-to-75")) return { band: "50–75% of shares", min: 50 };
  if (joined.includes("25-to-50")) return { band: "25–50% of shares", min: 25 };
  return { band: null, min: null };
}
