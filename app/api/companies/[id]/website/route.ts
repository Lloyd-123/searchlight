import { scoreCompany } from "@/lib/score";
import { getSettings } from "@/lib/settings";
import { loadCompanies } from "@/lib/view";
import { checkWebsite } from "@/lib/website";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [companies, { thesis, criteria }] = await Promise.all([loadCompanies(), getSettings()]);
  const company = companies.find((c) => c.row.id === Number(id));
  if (!company) return Response.json({ error: "Not found" }, { status: 404 });
  if (!scoreCompany(company, thesis).shortlisted)
    return Response.json({ error: "Website checks only run on shortlisted companies" }, { status: 400 });
  if (!criteria.length) return Response.json({ error: "Add at least one criterion first" }, { status: 400 });
  try {
    await checkWebsite(company.row.id, company.row.website, criteria);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Website check failed" }, { status: 502 });
  }
}
