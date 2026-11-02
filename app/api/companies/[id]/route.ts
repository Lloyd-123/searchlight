import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Body: any of { selected: boolean, website: string }.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { selected?: boolean; website?: string };
  if (typeof body.selected === "boolean") await q("UPDATE companies SET selected=$2 WHERE id=$1", [id, body.selected]);
  if (typeof body.website === "string") {
    const website = body.website.trim() || null;
    await q("UPDATE companies SET website=$2, website_status=NULL, website_note=NULL WHERE id=$1", [id, website]);
    await q("DELETE FROM website_checks WHERE company_id=$1", [id]);
  }
  return Response.json({ ok: true });
}
