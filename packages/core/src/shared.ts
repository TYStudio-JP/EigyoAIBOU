/**
 * ブラウザでも読み込める安全な入口（型とラベル定数のみ）。
 * クライアントコンポーネントは "@eigyo/core" ではなくこちらを import すること（node:sqlite を含まない）。
 */
export * from "./domain/types";
export type { PriceCheck, CheckLevel, PriceProposal } from "./domain/pricing";
export type { CrossSellResult, CrossSellCandidate, PeerEvidence } from "./domain/crosssell";
export type { FollowupItem } from "./domain/followup";
export type { QuoteSummary, PriceHistoryRow, NewQuoteItem } from "./domain/repo";
export type { ExtractedRequest } from "./ai/extract";
export type { FollowupDraft, InquiryDraft, ProposalDraft, QuoteReview } from "./ai/draft";
export type { ExtractInput } from "./ai/extract";
