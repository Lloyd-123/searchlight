import { q } from "./db";
import { DEFAULT_THESIS, Thesis } from "./score";

export type Operator = {
  name?: string;
  fund?: string;
  background?: string;
  whyBuying?: string;
  contact?: string;
};

export async function getSettings() {
  const [s] = await q("SELECT thesis,operator,criteria FROM settings WHERE id=1");
  return {
    thesis: { ...DEFAULT_THESIS, ...s.thesis } as Thesis,
    operator: (s.operator ?? {}) as Operator,
    criteria: (s.criteria ?? []) as string[],
  };
}
