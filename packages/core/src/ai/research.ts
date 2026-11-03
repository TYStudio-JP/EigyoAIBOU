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
export type ResearchKind = "general" | "equivalent" | "spec" | "size" | "price" | "successor";
const KIND_GUIDE: Record<ResearchKind, string> = {
  general: "",
  equivalent: "同等品を探す。他メーカーの同等品・互換品を 3〜5 点、『メーカー／品番／主な違い（寸法・材質・規格）／出典』の箇条書きで。完全互換か要確認かを明記。",
  spec: "仕様を調べる。材質・規格（JIS/EN 等）・耐性・入数・用途を数値と単位で。カタログや公式ページの値だけを使う。",
  size: "寸法を調べる。サイズ・厚み・長さ・内径外径・重量などを mm / g の数値で。サイズ展開があれば一覧に。",
  price: "相場を調べる。定価・市場価格の目安と、価格が変わる条件（ロット・ルート）。価格は出典と日付を添える。",
  successor: "後継品・廃番情報を調べる。生産終了の有無、後継品番、切替時の注意点。",
};

export async function researchWeb(query: string, context: string, today: string, kind: ResearchKind = "general"): Promise<ResearchResult> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 商品・メーカー・規格・相場・納期事情などをウェブで調べる。メーカー公式や規格団体などの一次情報を優先し、出典の URL を必ず示す。見つからなければ『確認できず』と書く。スマホで読む前提で、結論 → 要点（箇条書き 3〜6 行）→ 営業担当が仕入れ先に確認すべきこと の順、300 字程度。", cache_control: { type: "ephemeral" } }],
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: "user", content: `本日: ${today}\n調べたいこと: ${query}\n${KIND_GUIDE[kind] ? `観点: ${KIND_GUIDE[kind]}\n` : ""}背景: ${context || "（なし）"}` }],
    output_config: { effort: "low" },
  });
  const msg = await stream.finalMessage();
  const summary = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { summary: summary || "確認できませんでした。", sources: collectSources(msg.content) };
}
