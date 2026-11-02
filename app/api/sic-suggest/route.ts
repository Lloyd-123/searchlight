import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { allSicLines, isSicCode, sicLabel } from "@/lib/sic";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic();
const Output = z.object({ codes: z.array(z.string()) });

// For everyday words the registry doesn't use: "bakery" is "Manufacture of bread" and "Retail sale of bread".
export async function POST(req: Request) {
  const { query } = (await req.json()) as { query?: string };
  if (!query?.trim()) return Response.json({ matches: [] });
  try {
    const res = await anthropic.messages.parse({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      system:
        "You map a plain-English description of a business sector to UK SIC 2007 codes. Choose up to 8 codes from the list that best fit, most relevant first. " +
        `Choose only from this list. Return nothing if none fit.\n\n${allSicLines()}`,
      messages: [{ role: "user", content: `Sector: ${query.trim().slice(0, 200)}` }],
      output_config: { effort: "low", format: zodOutputFormat(Output) },
    });
    const codes = (res.parsed_output?.codes ?? []).filter(isSicCode);
    return Response.json({ matches: codes.map((code) => ({ code, label: sicLabel(code), isGroup: false })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Suggestion failed" }, { status: 502 });
  }
}
