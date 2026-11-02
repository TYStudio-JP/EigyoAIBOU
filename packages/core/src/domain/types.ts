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

export interface Customer {
  id: number;
  code: string;
  name: string;
  short_name: string;
  industry: string;
  prefecture: string;
  contact_name: string | null;
  contact_email: string | null;
  payment_terms: string;
  notes: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  route_type: RouteType;
  lead_time_days: number;
  contact_email: string | null;
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
};
