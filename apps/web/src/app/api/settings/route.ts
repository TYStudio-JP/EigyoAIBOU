import { getSettings, hasApiKey, MODEL, saveSettings } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET() { return ok({ settings: getSettings(db()), ai: { enabled: hasApiKey(), model: MODEL } }); }
export async function POST(req: Request) {
  try { return ok(saveSettings(db(), await req.json())); } catch (e) { return fail(e); }
}
