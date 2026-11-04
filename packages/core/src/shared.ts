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
export type { TimelineItem, LinkDecision, LinkCandidate } from "./domain/deals";
export type { ContactWorkload } from "./domain/repo";
export type { BusinessCard } from "./ai/card";
export type { CustomerOwnerRecord, User } from "./domain/types";
export type { KeijoRow, KeijoSheet } from "./domain/keijo";
export type { DeliveryWaiting } from "./domain/delivery";
export type { ImpactRow, ImpactSim } from "./domain/price-impact";
export type { ReportFacts } from "./domain/report";
export type { VisitBrief } from "./domain/brief";
export type { VisitBriefAi } from "./ai/brief";
export type { ChatTurn, ChatResult } from "./ai/chat";
export type { ResearchResult } from "./ai/research";
export { floorTo, resolvePricingRule, rulePrice } from "./domain/pricing-rule";
export type { PricingRule } from "./domain/pricing-rule";
export type { InboxItem } from "./domain/inbox";
export type { FormalDiff, ProvisionalSnapshotItem } from "./domain/provisional";
export type { SelfMailPackage } from "./domain/self-mail";
export type { TargetProgress, TargetCandidate } from "./domain/targets";
export type { ImportKind, ImportField, ImportPreview, ImportResult } from "./domain/import";
export { IMPORT_KIND_LABEL } from "./domain/import";
