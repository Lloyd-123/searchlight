import { q } from "@/lib/db";
import { scoreCompany } from "@/lib/score";
import { getSettings } from "@/lib/settings";
import { loadCompanies, toClient } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function GET() {
  const [companies, { thesis }] = await Promise.all([loadCompanies(), getSettings()]);
  return Response.json({
    companies: companies.map((c) => ({ ...toClient(c), score: scoreCompany(c, thesis) })),
  });
}

export async function DELETE() {
  await q("DELETE FROM companies");
  return Response.json({ ok: true });
}
