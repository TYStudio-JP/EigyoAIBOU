import { replyQueue } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** 返事待ち（外出先のホーム）。?all=1 で担当以外も含む。 */
export async function GET(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const all = new URL(req.url).searchParams.get("all") === "1";
    return ok(replyQueue(d, { userId: all ? null : me?.id ?? null }));
  } catch (e) { return fail(e); }
}
