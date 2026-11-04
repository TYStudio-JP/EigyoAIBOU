export type RouteType = "maker" | "agency" | "trading";
export type QuoteStatus = "draft" | "submitted" | "tracking" | "won" | "lost";
export type LostReason = "price" | "delivery" | "competitor" | "cancelled" | "other";

export const ROUTE_LABEL: Record<RouteType, string> = {
  maker: "メーカー直",
  agency: "代理店経由",
  trading: "商社経由",
};

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "下書き",
  submitted: "提出済",
  tracking: "追跡中",
  won: "受注",
  lost: "失注",
};

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "価格",
  delivery: "納期",
  competitor: "他社採用",
  cancelled: "案件消滅",
  other: "その他",
};

export type CustomerKind = "end_user" | "dealer";
export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = { end_user: "エンドユーザー", dealer: "ディーラー（商社・販売店）" };

/** 値付けルール：none=履歴から（既定）／markup=仕入れ×掛率／margin=粗利率で逆算。端数は rounding_unit（1・10・100 円）で切り捨て。 */
export type PricingMode = "none" | "markup" | "margin";
export const PRICING_MODE_LABEL: Record<PricingMode, string> = { none: "履歴から（既定）", markup: "掛率（仕入れ × 係数）", margin: "粗利率（%）で逆算" };
export const ROUNDING_UNITS = [1, 10, 100] as const;

/** 暫定回答の手段（正式見積書の前に単価を伝えた方法）。 */
export type ProvisionalChannel = "phone" | "sms" | "line" | "mail";
export const PROVISIONAL_CHANNEL_LABEL: Record<ProvisionalChannel, string> = { phone: "電話（口頭）", sms: "ショートメール", line: "LINE", mail: "メール（本文）" };

export type InboxKind = "call_open" | "call_needs_human" | "inquiry_open" | "quote_draft" | "provisional" | "delivery_waiting" | "followup";
export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  call_open: "電話メモ未入力",
  call_needs_human: "担当確認待ち",
  inquiry_open: "問い合わせ未回答",
  quote_draft: "見積り未提出",
  provisional: "正式未送付",
  delivery_waiting: "納期回答待ち",
  followup: "そろそろ確認",
};

// ---------- 問い合わせ回答 ----------
export type InquiryKind = "spec" | "delivery" | "stock" | "equivalent" | "price" | "other";
export const INQUIRY_KIND_LABEL: Record<InquiryKind, string> = { spec: "仕様・規格", delivery: "納期", stock: "在庫・入手可否", equivalent: "同等品・代替品", price: "価格", other: "その他" };
export type InquiryChannel = "mail" | "phone" | "line" | "sms" | "visit" | "other";
export const INQUIRY_CHANNEL_LABEL: Record<InquiryChannel, string> = { mail: "メール", phone: "電話", line: "LINE", sms: "ショートメール", visit: "訪問時", other: "その他" };
export type InquiryStatus = "open" | "answered" | "closed";
export interface Inquiry {
  id: number;
  user_id: number | null;
  customer_id: number | null;
  contact_id: number | null;
  deal_id: number | null;
  channel: InquiryChannel;
  kind: InquiryKind;
  question: string;
  answer: string | null;
  answer_channel: InquiryChannel | null;
  status: InquiryStatus;
  due: string | null;
  source: string;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface InquiryWithRefs extends Inquiry { customer: Customer | null; contact: Contact | null }

/** 共有メニュー（Android の share_target）から受け取った内容の一時保管。 */
export interface ShareItem { id: number; token: string; title: string; text: string; url: string; file_name: string | null; file_mime: string | null; created_at: string }

export interface Customer {
  id: number;
  code: string;
  name: string;
  short_name: string;
  industry: string;
  prefecture: string;
  contact_name: string | null;
  contact_email: string | null;
  tel: string | null;
  kind: CustomerKind;
  owner_user_id: number | null;
  payment_terms: string;
  notes: string;
  pricing_mode: PricingMode;
  markup_rate: number | null;
  margin_pct: number | null;
  rounding_unit: number;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  route_type: RouteType;
  lead_time_days: number;
  contact_email: string | null;
  /** この仕入れ先の仕入れ値に掛ける標準掛率（得意先にルールが無いときに使う）。 */
  markup_rate: number | null;
}

export interface Product {
  id: number;
  code: string;
  part_number: string;
  name: string;
  maker: string;
  category: string;
  unit: string;
  list_price: number;
  spec: string;
}

export interface SupplierPrice {
  id: number;
  product_id: number;
  supplier_id: number;
  cost: number;
  min_lot: number;
  lead_time_days: number | null;
  valid_from: string;
  supplier_name: string;
  route_type: RouteType;
}

export interface Quote {
  id: number;
  quote_no: string;
  customer_id: number;
  contact_id: number | null;
  deal_id: number | null;
  subject: string;
  status: QuoteStatus;
  requested_delivery: string | null;
  promised_delivery: string | null;
  valid_until: string | null;
  source_type: string;
  source_text: string;
  notes: string;
  lost_reason: LostReason | null;
  lost_detail: string | null;
  submitted_at: string | null;
  closed_at: string | null;
  /** 暫定回答（電話・SMS 等で単価を先に伝えた）日時。formal_sent_at が空なら「正式未送付」。 */
  provisional_at: string | null;
  provisional_channel: ProvisionalChannel | null;
  provisional_text: string | null;
  /** 暫定回答時点の明細スナップショット（正式見積書との差異チェック用）。 */
  provisional_items_json: string | null;
  formal_sent_at: string | null;
  /** 回答納期が概算（注文前）か確定（注文後）か。 */
  delivery_kind: DeliveryKind;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: number;
  quote_id: number;
  line_no: number;
  product_id: number | null;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  cost: number;
  supplier_id: number | null;
  supplier_delivery: string | null;
  remarks: string;
  /** メーカー・仕入れ先からの回答（単価・有効期限・最小ロット・メモ・記録日時）。cost はこの単価で更新される。 */
  supplier_quote_price: number | null;
  supplier_quote_valid_until: string | null;
  supplier_quote_min_lot: number | null;
  supplier_quote_note: string | null;
  supplier_quote_at: string | null;
}

export interface QuoteWithItems extends Quote {
  customer: Customer;
  items: (QuoteItem & { product: Product | null; supplier: Supplier | null })[];
  total: number;
  total_cost: number;
  margin_pct: number;
}

export interface Activity {
  id: number;
  quote_id: number;
  kind: string;
  body: string;
  created_at: string;
}

export interface Settings {
  company_name: string;
  company_address: string;
  company_tel: string;
  sales_rep: string;
  tax_rate: number;           // 0.10
  margin_floor_pct: number;   // これを割ると警告
  margin_target_pct: number;  // 推奨粗利率
  last_price_drop_warn_pct: number; // 前回単価からこれ以上下げたら警告
  followup_days_first: number;      // 提出後、最初の追跡を促す日数
  followup_days_repeat: number;     // それ以降、繰り返し促す日数
  quote_valid_days: number;
  /** 次の訪問まで何分以内になったらホームを「次の訪問」に切り替えるか。 */
  brief_switch_minutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  company_name: "株式会社ツヤ商事",
  company_address: "東京都千代田区丸の内1-1-1",
  company_tel: "03-0000-0000",
  sales_rep: "営業一課 山田 太郎",
  tax_rate: 0.1,
  margin_floor_pct: 15,
  margin_target_pct: 25,
  last_price_drop_warn_pct: 3,
  followup_days_first: 3,
  followup_days_repeat: 7,
  quote_valid_days: 30,
  brief_switch_minutes: 10,
};

// ---------- 電話メモ ----------
export type CallDirection = "in" | "out" | "unknown";
export type CallStatus = "open" | "processed" | "sent" | "closed";
export const CALL_STATUS_LABEL: Record<CallStatus, string> = { open: "メモ未入力", processed: "処理済", sent: "確認メール送付済", closed: "完了" };

export type CallRequestKind = "product_inquiry" | "price" | "delivery" | "quote_request" | "quantity_change" | "complaint" | "other";
export const CALL_REQUEST_LABEL: Record<CallRequestKind, string> = {
  product_inquiry: "商品問い合わせ", price: "価格相談", delivery: "納期相談", quote_request: "見積り依頼",
  quantity_change: "数量・内容変更", complaint: "クレーム・不具合", other: "その他",
};

export interface CallRequestResult {
  status: "done" | "needs_human" | "skipped";
  headline: string;      // 一行の結論（確認メールにも使う）
  detail: string;        // 根拠・補足
  quote_id?: number;
  quote_no?: string;
  product_code?: string;
}
export interface CallRequest {
  kind: CallRequestKind;
  detail: string;                 // 相手の発言の要約
  product_query: string | null;   // 商品の手がかり
  qty: number | null;
  unit: string | null;
  asked_price: number | null;     // 相手が口にした価格
  requested_delivery: string | null;
  quote_no: string | null;        // 既存見積りへの言及
  items: { product_query: string; qty: number }[]; // 見積り依頼のとき
  result?: CallRequestResult;
}
export interface CallMinutes {
  summary: string;                // 議事録（3〜5 行）
  counterpart: string | null;     // 相手の名前・役職
  requests: CallRequest[];
  promises: string[];             // こちらが約束したこと
  rep_todos: string[];            // 営業担当がやること
  next_contact: string | null;    // 次回連絡の目安
  mood: "good" | "neutral" | "concerned" | null;
}
export interface CallRecord {
  id: number;
  customer_id: number | null;
  contact_id: number | null;
  deal_id: number | null;
  tel: string | null;
  direction: CallDirection;
  started_at: string;
  duration_sec: number | null;
  source: string;
  memo: string;
  minutes_json: string | null;
  mail_subject: string | null;
  mail_body: string | null;
  status: CallStatus;
  process_state: "running" | "cancel" | null;
  process_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface CallWithCustomer extends CallRecord {
  customer: Customer | null;
  contact: Contact | null;
  minutes: CallMinutes | null;
}

// ---------- 担当者・納入先・案件 ----------
export type ContactStatus = "active" | "transferred" | "retired";
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = { active: "在籍", transferred: "異動", retired: "退職" };
export interface Contact {
  id: number;
  customer_id: number;
  name: string;
  department: string;
  title: string;
  tel: string | null;
  mobile: string | null;
  email: string | null;
  status: ContactStatus;
  notes: string;
  source: string;
  created_at: string;
  updated_at: string;
}
export interface EndCustomer {
  id: number;
  customer_id: number;
  name: string;
  industry: string;
  notes: string;
  created_at: string;
}
export type DealStatus = "inquiry" | "quoting" | "submitted" | "tracking" | "won" | "lost" | "dormant";
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  inquiry: "問い合わせ", quoting: "見積り中", submitted: "提出済", tracking: "追跡中", won: "受注", lost: "失注", dormant: "休眠",
};
export interface Deal {
  id: number;
  customer_id: number;
  contact_id: number | null;
  end_customer_id: number | null;
  title: string;
  status: DealStatus;
  summary: string;
  summary_detail: string;
  next_action: string;
  next_action_due: string | null;
  opened_at: string;
  last_activity_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface DealEvent {
  id: number;
  deal_id: number;
  kind: string;      // call / quote / followup / mail / note / ai / link
  body: string;
  ref_type: string | null; // quote / call
  ref_id: number | null;
  created_at: string;
}
export interface DealWithRefs extends Deal {
  customer: Customer;
  contact: Contact | null;
  end_customer: EndCustomer | null;
  amount: number;        // 紐づく見積りの合計（受注なら受注額）
  quote_count: number;
  call_count: number;
}

// ---------- ユーザー（自社の営業担当）と得意先の担当履歴 ----------
export interface User {
  id: number;
  name: string;
  department: string;
  email: string | null;
  status: "active" | "inactive";
  /** 月の売上目標（税抜）・粗利目標。null なら未設定。 */
  target_sales: number | null;
  target_margin: number | null;
  /** 得意先への代理送付（アプリから直接メール）を許可するか。既定は不可。 */
  proxy_send_allowed: number;
  /** カレンダーの非公開 iCal URL（Google カレンダー等）。訪問予定の取り込み元。 */
  calendar_ics_url: string | null;
  /** Google カレンダー OAuth 連携（refresh token はこの端末の SQLite にのみ保存）。 */
  google_refresh_token: string | null;
  google_calendar_id: string | null;
  google_email: string | null;
  created_at: string;
}

/** 訪問予定（アプリ内入力またはカレンダー取り込み）。時刻は "YYYY-MM-DD HH:MM"（ローカル）。 */
export interface Visit {
  id: number;
  user_id: number | null;
  customer_id: number | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  place: string;
  source: "manual" | "ics";
  external_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}
export interface VisitWithCustomer extends Visit { customer: Customer | null }

/** 回答納期の種類：注文前の概算か、注文後の確定か。 */
export type DeliveryKind = "estimate" | "confirmed";
export const DELIVERY_KIND_LABEL: Record<DeliveryKind, string> = { estimate: "概算（注文前）", confirmed: "確定（注文後）" };

export type CrossSellDismissReason = "proposed" | "not_needed";
export const CROSSSELL_DISMISS_LABEL: Record<CrossSellDismissReason, string> = { proposed: "提案済み", not_needed: "不要" };
export interface CrossSellDismissal { id: number; customer_id: number; product_id: number; reason: CrossSellDismissReason; note: string; created_at: string }

export interface MailLog { id: number; quote_id: number | null; user_id: number | null; kind: "self" | "customer"; to_addr: string; cc_addr: string | null; subject: string; created_at: string }
export interface CustomerOwnerRecord {
  id: number;
  customer_id: number;
  from_user_id: number | null;
  to_user_id: number;
  handed_at: string;
  note: string;
  handover_doc: string;
}
