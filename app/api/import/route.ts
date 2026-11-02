import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

export async function POST(req: Request) {
  const { rows } = (await req.json()) as { rows: Record<string, unknown>[] };
  if (!Array.isArray(rows)) return Response.json({ error: "rows must be an array" }, { status: 400 });
  let imported = 0;
  let skipped = 0;
  for (const r of rows.slice(0, 1000)) {
    const name = clean(r.name);
    if (!name) {
      skipped++;
      continue;
    }
    await q(
      "INSERT INTO companies (csv_name,csv_number,csv_website,csv_owner,csv_email) VALUES ($1,$2,$3,$4,$5)",
      [name, clean(r.number), clean(r.website), clean(r.owner), clean(r.email)],
    );
    imported++;
  }
  return Response.json({ imported, skipped });
}
