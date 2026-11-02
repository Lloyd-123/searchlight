import { generateMessage, validateMessage } from "@/lib/letter";
import { getSettings } from "@/lib/settings";
import { loadCompanies } from "@/lib/view";

export const dynamic = "force-dynamic";

// A test run: uses the editor's current text and saves nothing, so people can iterate freely.
export async function POST(req: Request) {
  const { companyId, subject, body } = (await req.json()) as { companyId: number; subject: string; body: string };
  const [companies, { operator }] = await Promise.all([loadCompanies(), getSettings()]);
  const company = companies.find((c) => c.row.id === companyId);
  if (!company || company.row.status !== "enriched") return Response.json({ error: "Pick an enriched company" }, { status: 400 });
  if (!body?.trim()) return Response.json({ error: "Write a message first" }, { status: 400 });
  try {
    const generated = await generateMessage(company, operator, { subject: subject ?? "", body });
    const { claims, status } = await validateMessage(company, operator, generated.subject, generated.body, generated.literals);
    return Response.json({
      subject: generated.subject,
      body: generated.body,
      note: generated.note,
      missing: generated.missing,
      claims,
      status,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 502 });
  }
}
