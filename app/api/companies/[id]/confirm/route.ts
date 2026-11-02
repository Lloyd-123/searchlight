import { q } from "@/lib/db";
import { enrichCompany } from "@/lib/enrich";

export const dynamic = "force-dynamic";

// Body: { companyNumber: string } to accept a candidate, { companyNumber: null } for "none of these",
// { retry: true } to send a failed row back through the queue.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { companyNumber?: string | null; retry?: boolean };
  const [row] = await q("SELECT * FROM companies WHERE id=$1", [id]);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  if (body.retry) {
    await q("UPDATE companies SET status='pending', status_note=NULL, updated_at=now() WHERE id=$1", [id]);
    return Response.json({ ok: true });
  }
  if (!body.companyNumber) {
    await q("UPDATE companies SET status='no_match', status_note='Rejected all candidates', updated_at=now() WHERE id=$1", [id]);
    return Response.json({ ok: true });
  }
  const offered = (row.candidates ?? []).some((c: any) => c.number === body.companyNumber);
  if (!offered) return Response.json({ error: "That company was not one of the candidates" }, { status: 400 });

  try {
    await enrichCompany(row, body.companyNumber, { method: "user", reason: `Confirmed by you. Model said: ${row.match_reason ?? "n/a"}` });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Enrichment failed" }, { status: 502 });
  }
}
