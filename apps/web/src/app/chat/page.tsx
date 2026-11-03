import { getChatTurns, hasApiKey, type ChatTurn } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { PageTitle } from "@/components/ui";
import { Chat } from "@/components/chat";
export const dynamic = "force-dynamic";
export default async function ChatPage() {
  const d = db(); const me = await currentUser(d);
  return (<><PageTitle title="質問する" /><Chat initial={getChatTurns<ChatTurn>(d, me?.id ?? null)} aiEnabled={hasApiKey()} /></>);
}
