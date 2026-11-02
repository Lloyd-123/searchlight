import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

export async function PUT(req: Request) {
  const body = await req.json();
  const current = await getSettings();
  await q("UPDATE settings SET thesis=$1, operator=$2, criteria=$3 WHERE id=1", [
    JSON.stringify(body.thesis ?? current.thesis),
    JSON.stringify(body.operator ?? current.operator),
    JSON.stringify(body.criteria ?? current.criteria),
  ]);
  return Response.json({ ok: true });
}
