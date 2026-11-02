import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

/** 引継ぎ書（Markdown）。facts は domain 側で機械的に作った事実リスト。AI は読みやすく整え、注意点を補う。 */
export async function writeHandover(facts: string, today: string): Promise<string> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const res = await getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 担当変更・転勤・退職時の得意先引継ぎ書を書く。後任が初回訪問前に読む想定。構成: 1.得意先の概要と商習慣 2.担当者（在籍/異動/退職を明記、人となり・注意点） 3.納入先（ディーラーの場合） 4.進行中の案件（状態・金額・次の一手・期限） 5.直近の受注/失注と理由 6.注意点とコツ。Markdown。事実に無いことは書かず、不明は『要確認』。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n\n${facts}` }],
    output_config: { effort: "medium" },
  });
  const msg = await res.finalMessage();
  return msg.content.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
}
