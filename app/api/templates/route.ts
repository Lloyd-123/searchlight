import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const STARTERS = [
  {
    name: "Short and direct",
    subject: "A quick note about [company]",
    body: `Hi [first name],

I've seen you've been working in {[industry] for over [years] years}. I'm an acquirer of businesses and yours caught my eye.

{Mention one specific thing from their website that shows I've actually looked at what they do}

I completely understand if selling isn't on your mind, but if you'd ever be open to a no-pressure chat, I'd be glad to hear from you.

Best wishes,
[my name]
[my firm]
[my contact]`,
  },
  {
    name: "Warmer, more personal",
    subject: "[company] and what comes next",
    body: `Dear [salutation],

My name is [my name], and I'm hoping to find one good business to take on and run for the long term. {Say briefly what I found interesting about [company], using what they do and how long they've been going}

A little about me: [my background].

{Explain gently that I'd look after what they've built and wouldn't expect them to be thinking about selling, without implying anything about their plans}

If you'd be open to a conversation at some point, you can reach me at [my contact].

Yours sincerely,
[my name]`,
  },
];

export async function GET() {
  let rows = await q("SELECT id,name,subject,body FROM templates ORDER BY id");
  if (!rows.length) {
    for (const t of STARTERS) await q("INSERT INTO templates (name,subject,body) VALUES ($1,$2,$3)", [t.name, t.subject, t.body]);
    rows = await q("SELECT id,name,subject,body FROM templates ORDER BY id");
  }
  return Response.json({ templates: rows });
}

export async function POST(req: Request) {
  const { name, subject, body } = (await req.json()) as { name?: string; subject?: string; body?: string };
  const [row] = await q("INSERT INTO templates (name,subject,body) VALUES ($1,$2,$3) RETURNING id,name,subject,body", [
    name?.trim() || "New template",
    subject ?? "",
    body ?? "",
  ]);
  return Response.json({ template: row });
}
