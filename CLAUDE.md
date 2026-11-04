# 営業AI棒（えいぎょうあいぼう）

日本の中小企業・商社でモノを売るルート営業の「商談・訪問・電話以外」を肩代わりする営業アシスタント。
Built with Claude: Japan 2026 ハッカソン（テーマ #1「あなたにしかない深さを」）の提出作品。

## 何をするアプリか
1. **見積り作成** — メール/電話メモ/添付をそのまま読ませ、商品を特定し、得意先ごと・商品ごと・仕入れ先ごとの過去価格と原価を照合して単価を提案。赤字・前回より値下げ・他社との乖離・より安い仕入れルートを警告する。
2. **見積り追跡** — 提出済み案件を「そろそろ確認すべき」順に並べ、フォロー文面（メール＋電話トーク）を下書き。受注/失注と理由を記録し、次の提案に活かす。
3. **横展開提案** — 同業（業種＋購買カテゴリの類似）で売れていて未購入の商品を根拠付きで抽出し、提案トークとメールを作る。
4. **電話メモ** — 切った直後にスマホで喋った内容を議事録と依頼事項に構造化し、依頼ごとに価格照合・納期算出・見積り下書きを実行、得意先宛ての確認メールを下書き。Android は通話終了を自動検知（`/api/calls/incoming`）。 処理は `domain/call-process.ts` が裏で動かす（`calls.process_state`、`after()` で応答後に実行、画面は 2 秒ごとに確認、キャンセル可）。文面で名乗るときは `domain/rep-name.ts` の `repSurname` で姓だけ。
5. **案件** — 得意先×ひとつの話。見積り・電話・フォロー・メールを自動で束ね（`domain/deals.ts` の採点＋ `ai/deals.ts` の裁定）、状態は自動導出、経緯は 3 行要約＋詳細。担当者（`contacts`）・納入先（`end_customers`）は案件の属性。
6. **担当者・引継ぎ** — 名刺写真から担当者登録（`ai/card.ts`）。自社ユーザー（`users`）間で得意先を引き継ぐと（`domain/handover.ts`）、引継ぎ書を保存し、各案件に「ここまでは前回の担当者〇〇」を記録、前任者には過去の担当先として残す。
7. **伝票計上指示**（`domain/keijo.ts`）、**営業日報**（`domain/report.ts` + `ai/report.ts`）、**納期回答待ち**（`domain/delivery.ts`）、**訪問前ブリーフ**（`domain/brief.ts` + `ai/brief.ts`）、**価格改定の影響**（`domain/price-impact.ts`）。いずれも事実は決定的に集め、AI は清書・要約だけ。
8. **質問する（チャット）** — `ai/chat.ts` の tool runner。道具は Web/MCP と同じドメイン関数。履歴は `chats` にユーザーごと。
9. **ウェブで調べる** — `ai/research.ts`（Claude のサーバー側 `web_search_20260209`）。チャットの道具にも入れている。社内記録とウェブ情報は区別して出す。
10. 仕入れ先への納期・価格問い合わせメールの下書き、Excel 見積書出力（自社書式テンプレート対応、13・14 参照）。
11. **外出先モード（スマホ）** — 設計書は `docs/スマホ版（外出先モード）設計_2026-11-03.md`。
   - **得意先に直接送らない。** 完成品は「自分宛てメール」（`domain/self-mail.ts`、SMTP は `.env` の `EIGYO_SMTP_*`）か共有メニューで本人に渡し、本人が転送する。
   - **暫定回答→正式未送付**（`domain/provisional.ts`）。口頭・SMS で単価を伝えたら `markProvisional` で記録（下書きは提出済へ、明細スナップショット保存）。`formalDiff` で正式版との差を赤表示、`markFormalSent` で完了。`quotes.status` の CHECK は変えず列追加で表現している。
   - **値付けルール**（`domain/pricing-rule.ts`、純粋関数で `@eigyo/core/shared` からも使える）。得意先の `pricing_mode`（markup／margin）＋ `rounding_unit`（1・10・100 円切り捨て）、仕入れ先の `markup_rate`。優先は得意先 → 仕入れ先。`proposePrice` は 前回単価 → ルール価格 → 他社平均 → 推奨粗利 → 定価 の順。
   - **返事待ち**（`domain/inbox.ts` の `replyQueue`）：電話メモ未入力・担当確認待ち・正式未送付・見積り未提出・納期回答待ち・そろそろ確認を急ぎ順に一本化。ホームと `/inbox`。
   - スマホの見積り画面は `components/quote-mobile.tsx`（ポイント確認＋下固定バー）、デスクトップは従来の `quote-detail.tsx`。
12. **目標と実績**（`domain/targets.ts`）— ユーザーごとの月目標（`users.target_sales/target_margin`）に対する受注実績・あといくら・金額順に何件で届くか。ホームの「今月の目標」。
13. **マスタ CSV 取り込み**（`domain/import.ts`）— 得意先・仕入れ先・商品・仕入れ価格・売上実績。UTF-8／Shift_JIS 自動判定、列名の同義語で自動対応、対応は `settings` に保存。**未対応の列は既存値を保つ**。売上実績は受注済み見積り（`source_type: import`）として入る。
14. **横展開の済み**（`crosssell_dismissals`）、**概算／確定納期**（`quotes.delivery_kind`、受注後に全明細の回答が揃うと自動で確定）、**代理送付**（`users.proxy_send_allowed`。`proxySendPreconditions` で許可・SMTP・宛先を検証し、画面の明示的な確認が無ければ送らない。`mail_log` に履歴）、**自社書式テンプレート**（`data/templates/quote_template.xlsx`、`{{キー}}` 差し込み、`{{item.*}}` 行を複製。`sampleQuoteTemplate` が土台）、**印刷・PDF** は `/quotes/[id]/print`。
15. **訪問予定とホームの自動切替**（`domain/visits.ts`）— `visits` テーブル（手入力 or カレンダー）。`parseIcs` は折り返し・TZID・UTC・終日・CANCELLED に対応、RRULE は展開しない。`syncIcsFromUrl` は https のみ・社内アドレス不可。`matchCustomerByText` で予定のタイトル・場所から得意先を推定（手で直した紐づけは再同期でも保つ）。`homeMode` は次の訪問まで `settings.brief_switch_minutes`（既定 10）以内か訪問中なら `brief`。画面は `components/home-switch.tsx`（`useSyncExternalStore` で 1 分刻み。描画中に `Date.now()` を呼ばない）＋ `brief-compact.tsx`、`/visits`。
16. **メーカー回答の入力→自動値付け**（`domain/supplier-quote.ts`）— 明細に仕入れ単価・納期・有効期限・最小ロットを記録（`quote_items.supplier_quote_*`、cost を更新、`supplier_prices` にも履歴追加、納期は `recordSupplierDelivery` 経由）。`apply_rule` で得意先ルールの売単価に更新。回答メールの読み取りは `ai/supplier-reply.ts`、AI 無しは `extractSupplierReplyFallback`。
17. **問い合わせ回答**（`domain/inquiries.ts`）— `inquiries` テーブル。`classifyInquiry` で種類（仕様・納期・在庫・同等品・価格）を推定、`inquiryFacts` が商品マスタ・仕入れルート（最短納期）・前回単価・同区分品を集め、`composeDeterministicAnswer` が社内記録だけの回答文を書く。AI 版は `ai/inquiry-answer.ts`（任意で `researchWeb` の結果を材料に。仕入れ値・仕入れ先名は得意先に出さない）。返事待ちに `inquiry_open`。画面 `/inquiries`。MCP `log_inquiry` `list_inquiries` `answer_inquiry`。
18. **写真→同等品**（`ai/product-photo.ts` + `domain/product-photo.ts`）— 写真から品番・品名を読み取り（image ブロック）、`identifyProduct` が自社マスタに当て（品番→品名→読めた文字）、同区分品とウェブ検索の問い合わせ文を返す。画面 `/products/photo`、API `/api/products/identify`（file または share_token）。
19. **Android 共有ターゲット** — manifest の `share_target` → `POST /share` が `share_inbox` に 1 時間だけ保管して `/share/pick` へ。見積り（`/quotes/new?text=`）／問い合わせ／写真へ振り分け。iPhone はコピペ。
20. **Google カレンダー OAuth**（`domain/google-calendar.ts`）— `.env` の `GOOGLE_CLIENT_ID/SECRET`。`/api/google/auth`（state を Cookie で検証）→ `/api/google/callback` → refresh token を `users.google_refresh_token` に保存 → `syncGoogleCalendar`（singleEvents で繰り返しも展開、`external_id='google:<id>'`、iCal 由来の予定は消さない）。未設定なら iCal URL で代替。

**スマホが主役。** 画面は下タブ＋大きなボタンのスマホ優先レイアウト（`lg:` 以上でサイドバー）。マスタ登録・設定はデスクトップのみ。外出先からは `npm run tunnel`（Cloudflare）＋ `EIGYO_ACCESS_KEY`（`apps/web/src/proxy.ts`）。

## 構成（npm workspaces）
- `packages/core` — ドメインロジックと SQLite（`node:sqlite`、ネイティブモジュール不要）。価格エンジン `domain/pricing.ts`、横展開 `domain/crosssell.ts`、追跡 `domain/followup.ts`、Claude 連携 `ai/*.ts`、ダミーデータ `seed/*`。
- `apps/web` — Next.js (App Router) の画面と API。クライアントコンポーネントは **`@eigyo/core/shared`**（型とラベルのみ）を import すること。`@eigyo/core` 本体は `node:sqlite` を含むのでサーバー側専用。
- `packages/mcp-server` — 同じロジックを MCP ツールとして公開（`.mcp.json` で Claude Code に登録済み）。
- `.claude/skills` — 見積り作成・追跡・横展開・問い合わせ回答（返事待ち・暫定回答を含む）の手順スキル。`.claude/agents` — 価格監査・フォロー文面のサブエージェント。

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
- 見積り・電話を作った後は必ず `attachQuoteToDeal` / `attachCallToDeal` → `refreshDealSummary` を通す（案件から漏れるものを作らない）。
- 操作ユーザーは Cookie（`lib/user.ts`）。会社導入時は認証に差し替える前提で、ユーザー ID の参照はこの関数に集約する。
