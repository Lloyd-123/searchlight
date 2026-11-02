import { q } from "@/lib/db";
import { generateMessage, validateMessage } from "@/lib/letter";
import { getSettings } from "@/lib/settings";
import { loadCompanies } from "@/lib/view";

export const dynamic = "force-dynamic";

// Body: { action: "draft", subject, body } | { action: "validate" | "contacted" | "uncontacted", force?: boolean }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, force, subject, body } = (await req.json()) as { action: string; force?: boolean; subject?: string; body?: string };
  const [companies, { operator }] = await Promise.all([loadCompanies(), getSettings()]);
  const company = companies.find((c) => c.row.id === Number(id));
  if (!company) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    if (action === "draft") {
      if (!body?.trim()) return Response.json({ error: "Write a message first" }, { status: 400 });
      const g = await generateMessage(company, operator, { subject: subject ?? "", body });
      await q(
        `INSERT INTO letters (company_id,subject,body,note,literals,claims,validation_status) VALUES ($1,$2,$3,$4,$5,NULL,'unvalidated')
         ON CONFLICT (company_id) DO UPDATE SET subject=$2, body=$3, note=$4, literals=$5, claims=NULL, validation_status='unvalidated', updated_at=now()`,
        [company.row.id, g.subject, g.body, g.note, JSON.stringify(g.literals)],
      );
      return Response.json({ ok: true });
    }
    if (!company.letter) return Response.json({ error: "Generate a message first" }, { status: 400 });
    if (action === "validate") {
      const { claims, status } = await validateMessage(company, operator, company.letter.subject ?? "", company.letter.body, company.letter.literals ?? []);
      await q("UPDATE letters SET claims=$2, validation_status=$3, updated_at=now() WHERE company_id=$1", [
        company.row.id, JSON.stringify(claims), status,
      ]);
      return Response.json({ ok: true, status });
    }
    if (action === "contacted") {
      if (company.letter.validation_status !== "passed" && !force)
        return Response.json({ error: "This message has not passed validation", needsForce: true }, { status: 409 });
      await q("UPDATE companies SET contacted_at=now() WHERE id=$1", [company.row.id]);
      return Response.json({ ok: true });
    }
    if (action === "uncontacted") {
      await q("UPDATE companies SET contacted_at=NULL WHERE id=$1", [company.row.id]);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "That failed" }, { status: 502 });
  }
}

// Saving an edit clears validation, because the checked text no longer exists.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { body } = (await req.json()) as { body: string };
  await q("UPDATE letters SET body=$2, claims=NULL, validation_status='unvalidated', updated_at=now() WHERE company_id=$1", [id, body]);
  return Response.json({ ok: true });
}
