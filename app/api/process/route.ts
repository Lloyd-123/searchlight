import { q } from "@/lib/db";
import { processRow } from "@/lib/enrich";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 3;

// The browser calls this in a loop. Row state lives in Postgres, so a refresh just resumes,
// and rows left in 'processing' by an interrupted request are reclaimed after two minutes.
export async function POST() {
  const rows = await q(
    `UPDATE companies SET status='processing', status_note=NULL, updated_at=now() WHERE id IN (
       SELECT id FROM companies
       WHERE status='pending' OR (status='processing' AND updated_at < now() - interval '2 minutes')
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
     ) RETURNING *`,
    [BATCH_SIZE],
  );
  for (const row of rows) await processRow(row);
  const [{ remaining }] = await q<{ remaining: number }>(
    "SELECT count(*)::int AS remaining FROM companies WHERE status IN ('pending','processing')",
  );
  return Response.json({ processed: rows.length, remaining });
}
