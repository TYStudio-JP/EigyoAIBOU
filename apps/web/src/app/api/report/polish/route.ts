import { polishDailyReport } from "@eigyo/core";
import { fail, ok } from "../../_util";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { const b = (await req.json()) as { draft: string; memo: string; date: string }; return ok({ body: await polishDailyReport(b.draft, b.memo, b.date) }); } catch (e) { return fail(e); }
}
