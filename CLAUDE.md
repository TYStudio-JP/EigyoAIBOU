# 営業AI棒（えいぎょうあいぼう）

日本の中小企業・商社でモノを売るルート営業の「商談・訪問・電話以外」を肩代わりする営業アシスタント。
Built with Claude: Japan 2026 ハッカソン（テーマ #1「あなたにしかない深さを」）の提出作品。

## 何をするアプリか
1. **見積り作成** — メール/電話メモ/添付をそのまま読ませ、商品を特定し、得意先ごと・商品ごと・仕入れ先ごとの過去価格と原価を照合して単価を提案。赤字・前回より値下げ・他社との乖離・より安い仕入れルートを警告する。
2. **見積り追跡** — 提出済み案件を「そろそろ確認すべき」順に並べ、フォロー文面（メール＋電話トーク）を下書き。受注/失注と理由を記録し、次の提案に活かす。
3. **横展開提案** — 同業（業種＋購買カテゴリの類似）で売れていて未購入の商品を根拠付きで抽出し、提案トークとメールを作る。
4. **電話メモ** — 切った直後にスマホで喋った内容を議事録と依頼事項に構造化し、依頼ごとに価格照合・納期算出・見積り下書きを実行、得意先宛ての確認メールを下書き。Android は通話終了を自動検知（`/api/calls/incoming`）。
5. 仕入れ先への納期・価格問い合わせメールの下書き、Excel 見積書出力。

**スマホが主役。** 画面は下タブ＋大きなボタンのスマホ優先レイアウト（`lg:` 以上でサイドバー）。マスタ登録・設定はデスクトップのみ。外出先からは `npm run tunnel`（Cloudflare）＋ `EIGYO_ACCESS_KEY`（`apps/web/src/proxy.ts`）。

## 構成（npm workspaces）
- `packages/core` — ドメインロジックと SQLite（`node:sqlite`、ネイティブモジュール不要）。価格エンジン `domain/pricing.ts`、横展開 `domain/crosssell.ts`、追跡 `domain/followup.ts`、Claude 連携 `ai/*.ts`、ダミーデータ `seed/*`。
- `apps/web` — Next.js (App Router) の画面と API。クライアントコンポーネントは **`@eigyo/core/shared`**（型とラベルのみ）を import すること。`@eigyo/core` 本体は `node:sqlite` を含むのでサーバー側専用。
- `packages/mcp-server` — 同じロジックを MCP ツールとして公開（`.mcp.json` で Claude Code に登録済み）。
- `.claude/skills` — 見積り作成・追跡・横展開の手順スキル。`.claude/agents` — 価格監査・フォロー文面のサブエージェント。

## コマンド
- `npm install` → `npm run dev`（http://localhost:3000、初回起動時にダミーデータを自動投入）
- `npm test`（core のユニットテスト）、`npm run typecheck`、`npm run lint`、`npm run build`
- `npm run seed`（ダミーデータを入れ直す）、`npm run mcp`（MCP サーバー単体起動）、`npm run tunnel`（スマホ公開）
- API キーは `.env` の `ANTHROPIC_API_KEY`。モデルは `EIGYO_MODEL`（既定 `claude-opus-5-5`）。

## 約束ごと
- 価格に関する判断は **人が最終決定**する。AI は根拠と選択肢を示すだけ。チェックの文言は「なぜ」「どうすれば良いか」を必ず含める。
- データはすべて架空（`packages/core/src/seed/data.ts`）。実在の企業名・製品名を入れない。
- `data/*.db` は生成物。コミットしない。
- Claude API の呼び出しは `packages/core/src/ai/` に集約し、構造化出力（zod）で受け取る。`messages.create` を各所に散らさない。
- 日本語 UI。数字は `num` クラス（等幅数字）で揃える。一覧はスマホでカード、`lg:` 以上でテーブル（`hidden lg:table` / `lg:hidden`）。
- 電話の依頼事項の実行は `domain/call-actions.ts` の決定的ロジック。Claude には構造化と文面作成だけをさせる。
