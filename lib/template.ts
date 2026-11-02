// Message template syntax, shared by the editor and the server:
//   [owner name]    replaced exactly with a stored fact
//   {any text}      rewritten by the AI, which may use [tags] and research from the fact sheet
//   everything else is sent word for word

export const TAGS: { name: string; hint: string; aliases?: string[] }[] = [
  { name: "owner name", hint: "Full name", aliases: ["owner"] },
  { name: "first name", hint: "Owner's first name", aliases: ["owner first name"] },
  { name: "salutation", hint: "Mr Smith, or Sir William" },
  { name: "company", hint: "Registered name, tidied", aliases: ["company name"] },
  { name: "years", hint: "Full years since incorporation", aliases: ["years trading"] },
  { name: "founded", hint: "Year of incorporation", aliases: ["incorporated"] },
  { name: "industry", hint: "SIC description", aliases: ["sector"] },
  { name: "town", hint: "Registered office town", aliases: ["location"] },
  { name: "website", hint: "Company website" },
  { name: "my name", hint: "From your profile" },
  { name: "my firm", hint: "From your profile", aliases: ["my fund"] },
  { name: "my background", hint: "From your profile" },
  { name: "my reason", hint: "Why you want to buy" },
  { name: "my contact", hint: "From your profile" },
];

const BY_ALIAS = new Map(TAGS.flatMap((t) => [t.name, ...(t.aliases ?? [])].map((a) => [a, t.name] as const)));

export const canonicalTag = (raw: string) => BY_ALIAS.get(raw.trim().toLowerCase().replace(/\s+/g, " ")) ?? null;

export type Segment =
  | { type: "text"; text: string }
  | { type: "tag"; raw: string; name: string | null }
  | { type: "ai"; raw: string; parts: Segment[] };

function parseFlat(src: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of src.matchAll(/\[([^\[\]\n]*)\]/g)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ type: "text", text: src.slice(at, start) });
    out.push({ type: "tag", raw: m[1], name: canonicalTag(m[1]) });
    at = start + m[0].length;
  }
  if (at < src.length) out.push({ type: "text", text: src.slice(at) });
  return out;
}

export function parseTemplate(src: string): { segments: Segment[]; errors: string[] } {
  const segments: Segment[] = [];
  const errors: string[] = [];
  let at = 0;
  while (at < src.length) {
    const open = src.indexOf("{", at);
    if (open < 0) {
      segments.push(...parseFlat(src.slice(at)));
      break;
    }
    if (open > at) segments.push(...parseFlat(src.slice(at, open)));
    const close = src.indexOf("}", open);
    const nextOpen = src.indexOf("{", open + 1);
    if (close < 0 || (nextOpen >= 0 && nextOpen < close)) {
      errors.push("A { has no matching }");
      segments.push({ type: "text", text: src.slice(open) });
      break;
    }
    const raw = src.slice(open + 1, close);
    if (raw.trim()) segments.push({ type: "ai", raw, parts: parseFlat(raw) });
    else errors.push("There is an empty { } section");
    at = close + 1;
  }
  if (src.includes("}") && !src.includes("{")) errors.push("A } has no matching {");

  for (const t of segments.flatMap((s) => (s.type === "ai" ? s.parts : [s]))) {
    if (t.type === "tag" && !t.name) {
      errors.push(
        /age|birth|dob/i.test(t.raw)
          ? `[${t.raw}] isn't available: age is for targeting and stays out of messages`
          : `[${t.raw}] isn't a known detail`,
      );
    }
  }
  return { segments, errors };
}
