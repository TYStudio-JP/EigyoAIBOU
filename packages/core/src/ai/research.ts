import type Anthropic from "@anthropic-ai/sdk";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

export interface ResearchResult { summary: string; sources: { title: string; url: string }[] }

/** Claude のサーバー側ウェブ検索ツール（検索と取得は Anthropic 側で実行）。 */
export const WEB_SEARCH_TOOL = { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 4 };

function collectSources(content: Anthropic.Beta.BetaContentBlock[]): { title: string; url: string }[] {
  const out = new Map<string, string>();
  for (const b of content) {
    if (b.type === "text" && b.citations) for (const c of b.citations) if (c.type === "web_search_result_location") out.set(c.url, c.title ?? c.url);
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") out.set(r.url, r.title);
  }
  return [...out.entries()].map(([url, title]) => ({ title, url }));
}

/** 商品・メーカー・相場などをウェブで調べ、一次情報（メーカーサイト等）を優先して要約する。 */
export async function researchWeb(query: string, context: string, today: string): Promise<ResearchResult> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 商品・メーカー・規格・相場・納期事情などをウェブで調べる。メーカー公式や規格団体などの一次情報を優先し、出典の URL を必ず示す。見つからなければ『確認できず』と書く。スマホで読む前提で、結論 → 要点（箇条書き 3〜6 行）→ 営業担当が仕入れ先に確認すべきこと の順、300 字程度。", cache_control: { type: "ephemeral" } }],
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: `本日: ${today}\n調べたいこと: ${query}\n背景: ${context || "（なし）"}` }],
    output_config: { effort: "low" },
  });
  const msg = await stream.finalMessage();
  const summary = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { summary: summary || "確認できませんでした。", sources: collectSources(msg.content) };
}
