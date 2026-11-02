import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { name, subject, body } = (await req.json()) as { name: string; subject: string; body: string };
  await q("UPDATE templates SET name=$2, subject=$3, body=$4, updated_at=now() WHERE id=$1", [id, name.trim() || "Untitled", subject, body]);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await q("DELETE FROM templates WHERE id=$1", [id]);
  return Response.json({ ok: true });
}
