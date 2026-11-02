import { getReport, reportDraft, reportFacts, saveReport } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { todayIso } from "@/lib/format";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const d = db();
  const me = await currentUser(d);
  const date = new URL(req.url).searchParams.get("date") ?? todayIso();
  const facts = reportFacts(d, date, me?.id ?? null);
  return ok({ date, facts, draft: reportDraft(facts), saved: getReport(d, date, me?.id ?? null) });
}
export async function POST(req: Request) {
  try { const d = db(); const me = await currentUser(d); const b = (await req.json()) as { date: string; body: string }; saveReport(d, b.date, me?.id ?? null, b.body); return ok({ ok: true }); } catch (e) { return fail(e); }
}
