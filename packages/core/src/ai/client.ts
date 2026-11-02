import Anthropic from "@anthropic-ai/sdk";

/** 既定モデル。環境変数 EIGYO_MODEL で変更可能（例: claude-sonnet-5-5 で低コスト運用）。 */
export const MODEL: string = process.env.EIGYO_MODEL ?? "claude-opus-5-5";

/** 安全分類器による拒否時に別モデルへ自動フォールバックする（Claude API 標準機能）。 */
export const FALLBACK_BETAS = ["server-side-fallback-2026-07-01"] as const;

let cached: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!cached) cached = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return cached;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class AiUnavailableError extends Error {
  constructor(msg = "ANTHROPIC_API_KEY が設定されていません。.env に API キーを設定してください。") {
    super(msg);
    this.name = "AiUnavailableError";
  }
}

/** 営業AI棒 共通のシステムプロンプト（キャッシュ対象。固定文言にすること）。 */
export const SYSTEM_BASE = `あなたは「営業AI棒（えいぎょうあいぼう）」。日本の中小企業・商社でモノを売るルート営業担当の相棒です。
得意先訪問・商談・電話以外の事務作業（見積り作成、価格確認、追跡、問い合わせ対応）を肩代わりし、
営業担当が人と向き合う時間を増やすことが使命です。

行動原則:
- 事実（履歴・原価・納期）と推測を明確に分ける。数字は根拠付きで示す。
- 日本の商習慣に沿った丁寧だが簡潔なビジネス文を書く。冗長な前置きは不要。
- 不明点は勝手に埋めず「要確認」として列挙する。
- 営業担当の判断を奪わない。最終決定は人が行う前提で、選択肢と推奨を示す。`;
