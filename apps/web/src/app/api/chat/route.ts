import { clearChat, getChatTurns, runChat, saveChatTurns, type ChatTurn } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";

export async function GET() {
  const d = db(); const me = await currentUser(d);
  return ok({ turns: getChatTurns<ChatTurn>(d, me?.id ?? null) });
}
export async function POST(req: Request) {
  try {
    const d = db(); const me = await currentUser(d);
    const { message } = (await req.json()) as { message: string };
    if (!message?.trim()) return fail(new Error("メッセージが空です"), 400);
    const uid = me?.id ?? null;
    const history = getChatTurns<ChatTurn>(d, uid);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const result = await runChat(d, history, message, uid);
    const turns: ChatTurn[] = [...history, { role: "user", text: message, at: now }, { role: "assistant", text: result.reply, at: now, tools: result.tools_used, links: result.links }];
    saveChatTurns(d, uid, turns);
    return ok({ reply: result.reply, tools_used: result.tools_used, links: result.links });
  } catch (e) { return fail(e); }
}
export async function DELETE() {
  const d = db(); const me = await currentUser(d); clearChat(d, me?.id ?? null); return ok({ ok: true });
}
