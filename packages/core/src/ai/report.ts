import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

/** 日報の下書き（事実）を、上司が読みやすい日報に整える。事実を増やさない。 */
export async function polishDailyReport(draft: string, memo: string, today: string): Promise<string> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const res = await getClient().beta.messages.stream({
    model: MODEL, max_tokens: 3000, betas: [...FALLBACK_BETAS], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 営業日報の清書。与えられた事実（電話・見積り・受注失注・案件・明日の予定）と担当者の一言メモだけを使い、上司が 1 分で読める日報にする。数字と固有名詞は変えない。無い事実は書かない。Markdown、見出しは 活動 / 成果 / 課題と相談 / 明日の予定 / 所感。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n\n--- 事実（下書き） ---\n${draft}\n\n--- 担当者の一言メモ ---\n${memo || "（なし）"}` }],
    output_config: { effort: "low" },
  });
  const m = await res.finalMessage();
  return m.content.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
}
