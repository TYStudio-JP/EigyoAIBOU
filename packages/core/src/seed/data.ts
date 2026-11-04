/** 架空の得意先・仕入れ先・商品マスタ（実在の企業・製品とは無関係）。 */
import type { RouteType } from "../domain/types";

export interface SeedCustomer { code: string; name: string; short_name: string; industry: string; prefecture: string; contact_name: string; contact_email: string; tel: string; payment_terms: string; notes: string; discount: number; kind?: "end_user" | "dealer"; pricing_mode?: "none" | "markup" | "margin"; markup_rate?: number; margin_pct?: number; rounding_unit?: number; }
export interface SeedContact { customer: string; name: string; department: string; title: string; tel?: string; mobile?: string; email?: string; status?: "active" | "transferred" | "retired"; notes?: string; }
export interface SeedEndCustomer { customer: string; name: string; industry: string; contact: string; notes?: string; }
export interface SeedSupplier { code: string; name: string; route_type: RouteType; lead_time_days: number; contact_email: string; markup_rate?: number; }
export interface SeedProduct { code: string; part_number: string; name: string; maker: string; category: string; unit: string; list_price: number; spec: string; routes: { supplier: string; ratio: number; min_lot: number; lead?: number }[]; revised?: { from: string; ratio: number }; }

export const CUSTOMERS: SeedCustomer[] = [
  { code: "C001", name: "東海精密工業株式会社", short_name: "東海精密", industry: "自動車部品", prefecture: "愛知県", contact_name: "佐藤 健一", contact_email: "sato@tokai-seimitsu.example.jp", tel: "052-000-0101", payment_terms: "月末締め翌月末払い", notes: "量産ラインの消耗品を月次で発注。価格にシビアだが納期遵守を最重視。", discount: 0.78, pricing_mode: "margin", margin_pct: 22, rounding_unit: 10 },
  { code: "C002", name: "北関東ベアリング株式会社", short_name: "北関東ベアリング", industry: "自動車部品", prefecture: "群馬県", contact_name: "鈴木 美咲", contact_email: "suzuki@kitakanto-brg.example.jp", tel: "027-000-0102", payment_terms: "20日締め翌月20日払い", notes: "購買部経由。相見積り必須。", discount: 0.82 },
  { code: "C003", name: "みどり食品株式会社", short_name: "みどり食品", industry: "食品製造", prefecture: "埼玉県", contact_name: "高橋 誠", contact_email: "takahashi@midori-foods.example.jp", tel: "048-000-0103", payment_terms: "月末締め翌月末払い", notes: "HACCP対応の衛生資材を重視。工場長が決裁。", discount: 0.85, pricing_mode: "markup", markup_rate: 1.35, rounding_unit: 100 },
  { code: "C004", name: "さくら製菓株式会社", short_name: "さくら製菓", industry: "食品製造", prefecture: "千葉県", contact_name: "田中 由美", contact_email: "tanaka@sakura-seika.example.jp", tel: "043-000-0104", payment_terms: "月末締め翌々月10日払い", notes: "年末繁忙期前（10〜11月）に梱包資材をまとめ買い。", discount: 0.88 },
  { code: "C005", name: "大江戸パン株式会社", short_name: "大江戸パン", industry: "食品製造", prefecture: "東京都", contact_name: "伊藤 翔", contact_email: "ito@oedo-pan.example.jp", tel: "03-0000-0105", payment_terms: "月末締め翌月末払い", notes: "新規取引1年目。まだ取扱品目が少ない。", discount: 0.9 },
  { code: "C006", name: "湘南建設株式会社", short_name: "湘南建設", industry: "建設", prefecture: "神奈川県", contact_name: "渡辺 大輔", contact_email: "watanabe@shonan-kensetsu.example.jp", tel: "0466-00-0106", payment_terms: "月末締め翌月末払い", notes: "現場ごとに納品先が変わる。安全保護具の更新時期は4月。", discount: 0.8, pricing_mode: "markup", markup_rate: 1.3, rounding_unit: 10 },
  { code: "C007", name: "関東土木株式会社", short_name: "関東土木", industry: "建設", prefecture: "茨城県", contact_name: "山本 浩二", contact_email: "yamamoto@kanto-doboku.example.jp", tel: "029-000-0107", payment_terms: "月末締め翌月末払い", notes: "電話注文が多い。FAXで見積り依頼が届くことも。", discount: 0.84 },
  { code: "C008", name: "日之出物流株式会社", short_name: "日之出物流", industry: "物流", prefecture: "埼玉県", contact_name: "中村 彩", contact_email: "nakamura@hinode-logi.example.jp", tel: "048-000-0108", payment_terms: "月末締め翌月末払い", notes: "梱包資材の大口。ストレッチフィルムは毎月パレット単位。", discount: 0.76 },
  { code: "C009", name: "富士ロジスティクス株式会社", short_name: "富士ロジ", industry: "物流", prefecture: "静岡県", contact_name: "小林 遼", contact_email: "kobayashi@fuji-logi.example.jp", tel: "054-000-0109", payment_terms: "月末締め翌月末払い", notes: "倉庫新設に伴い備品需要あり。", discount: 0.83 },
  { code: "C010", name: "千葉化成株式会社", short_name: "千葉化成", industry: "化学", prefecture: "千葉県", contact_name: "加藤 直樹", contact_email: "kato@chiba-kasei.example.jp", tel: "043-000-0110", payment_terms: "月末締め翌月末払い", notes: "SDS提出が必須。ケミカル品は銘柄指定が多い。", discount: 0.8 },
  { code: "C011", name: "東洋樹脂株式会社", short_name: "東洋樹脂", industry: "化学", prefecture: "栃木県", contact_name: "吉田 恵", contact_email: "yoshida@toyo-jushi.example.jp", tel: "028-000-0111", payment_terms: "月末締め翌月末払い", notes: "離型剤・洗浄剤の定期品。", discount: 0.81 },
  { code: "C012", name: "相模電機製作所株式会社", short_name: "相模電機", industry: "電機", prefecture: "神奈川県", contact_name: "山田 亮", contact_email: "yamada@sagami-denki.example.jp", tel: "046-000-0112", payment_terms: "月末締め翌月末払い", notes: "工具は銘柄指定。電設資材はまとめ買い。", discount: 0.79 },
  { code: "C013", name: "武蔵野金属加工株式会社", short_name: "武蔵野金属", industry: "自動車部品", prefecture: "東京都", contact_name: "斎藤 剛", contact_email: "saito@musashino-metal.example.jp", tel: "042-000-0113", payment_terms: "月末締め翌月末払い", notes: "東海精密の二次下請け。切削工具は東海精密と同じ銘柄を使用。", discount: 0.86 },
  { code: "C014", name: "多摩電子部品株式会社", short_name: "多摩電子", industry: "電機", prefecture: "東京都", contact_name: "松本 真由", contact_email: "matsumoto@tama-denshi.example.jp", tel: "042-000-0114", payment_terms: "25日締め翌月末払い", notes: "クリーンルーム用の消耗品を検討中。", discount: 0.87 },
  { code: "C015", name: "北関東機工販売株式会社", short_name: "北関東機工", industry: "自動車部品", prefecture: "群馬県", contact_name: "石井 和也", contact_email: "ishii@kitakanto-kiko.example.jp", tel: "027-000-0115", payment_terms: "月末締め翌月末払い", notes: "ディーラー。県内の自動車部品工場 10 社ほどに販売。担当者ごとに受け持つ工場が違う。", discount: 0.74, kind: "dealer" },
  { code: "C016", name: "湘南産業資材株式会社", short_name: "湘南産業資材", industry: "建設", prefecture: "神奈川県", contact_name: "大野 裕子", contact_email: "ono@shonan-sangyo.example.jp", tel: "0466-00-0116", payment_terms: "月末締め翌月末払い", notes: "ディーラー。建設会社・電気工事店向け。支店ごとに担当者が分かれている。", discount: 0.76, kind: "dealer" },
];

/** 得意先の担当者（架空）。在籍・異動・退職を混ぜ、引継ぎのデモに使う。 */
export const CONTACTS: SeedContact[] = [
  { customer: "C001", name: "佐藤 健一", department: "購買部", title: "課長", tel: "052-000-0101", mobile: "090-0000-0101", email: "sato@tokai-seimitsu.example.jp", notes: "価格交渉は必ず相見積り。納期遵守を最重視。" },
  { customer: "C001", name: "村田 浩", department: "製造2課", title: "工場長", tel: "052-000-0121", email: "murata@tokai-seimitsu.example.jp", notes: "現場の困りごとは村田さんに聞くと早い。第2ラインの責任者。" },
  { customer: "C001", name: "岡田 真", department: "購買部", title: "主任", status: "transferred", notes: "2026年4月に名古屋支社へ異動。後任は佐藤課長。" },
  { customer: "C002", name: "鈴木 美咲", department: "購買課", title: "係長", tel: "027-000-0102", email: "suzuki@kitakanto-brg.example.jp" },
  { customer: "C002", name: "木村 大地", department: "生産技術", title: "", mobile: "090-0000-0202", notes: "切削条件の相談相手。工具の銘柄指定はこの人。" },
  { customer: "C003", name: "高橋 誠", department: "製造部", title: "部長", tel: "048-000-0103", email: "takahashi@midori-foods.example.jp", notes: "決裁者。HACCP 監査前は衛生資材の相談が増える。" },
  { customer: "C003", name: "林 由紀", department: "総務", title: "", email: "hayashi@midori-foods.example.jp", notes: "伝票・請求の窓口。" },
  { customer: "C004", name: "田中 由美", department: "資材課", title: "", tel: "043-000-0104", email: "tanaka@sakura-seika.example.jp" },
  { customer: "C005", name: "伊藤 翔", department: "工場", title: "", tel: "03-0000-0105", email: "ito@oedo-pan.example.jp" },
  { customer: "C006", name: "渡辺 大輔", department: "工事部", title: "所長", mobile: "090-0000-0106", email: "watanabe@shonan-kensetsu.example.jp", notes: "現場直行が多く携帯のみ。朝 8 時前がつながりやすい。" },
  { customer: "C007", name: "山本 浩二", department: "資材", title: "", tel: "029-000-0107", email: "yamamoto@kanto-doboku.example.jp" },
  { customer: "C008", name: "中村 彩", department: "業務部", title: "主任", tel: "048-000-0108", email: "nakamura@hinode-logi.example.jp" },
  { customer: "C008", name: "藤田 剛", department: "業務部", title: "部長", status: "retired", notes: "2026年3月に定年退職。梱包資材の年間契約は藤田部長時代の条件。" },
  { customer: "C009", name: "小林 遼", department: "倉庫管理", title: "", tel: "054-000-0109", email: "kobayashi@fuji-logi.example.jp" },
  { customer: "C010", name: "加藤 直樹", department: "購買", title: "課長", tel: "043-000-0110", email: "kato@chiba-kasei.example.jp", notes: "SDS 提出を忘れると受け取ってもらえない。" },
  { customer: "C011", name: "吉田 恵", department: "製造", title: "", tel: "028-000-0111", email: "yoshida@toyo-jushi.example.jp" },
  { customer: "C012", name: "山田 亮", department: "設備", title: "係長", tel: "046-000-0112", email: "yamada@sagami-denki.example.jp" },
  { customer: "C013", name: "斎藤 剛", department: "工場", title: "工場長", tel: "042-000-0113", email: "saito@musashino-metal.example.jp" },
  { customer: "C014", name: "松本 真由", department: "購買", title: "", tel: "042-000-0114", email: "matsumoto@tama-denshi.example.jp" },
  { customer: "C015", name: "石井 和也", department: "営業1課", title: "課長", tel: "027-000-0115", mobile: "090-0000-0115", email: "ishii@kitakanto-kiko.example.jp", notes: "太田・伊勢崎方面の工場を担当。" },
  { customer: "C015", name: "前田 沙織", department: "営業2課", title: "", mobile: "090-0000-0215", email: "maeda@kitakanto-kiko.example.jp", notes: "高崎方面を担当。見積り依頼は Excel 添付が多い。" },
  { customer: "C016", name: "大野 裕子", department: "藤沢支店", title: "支店長", tel: "0466-00-0116", email: "ono@shonan-sangyo.example.jp" },
  { customer: "C016", name: "三浦 健", department: "横浜支店", title: "", mobile: "090-0000-0216", email: "miura@shonan-sangyo.example.jp", notes: "電気工事店向けの電設資材が中心。" },
];

/** ディーラーの納入先（得意先の得意先）。 */
export const END_CUSTOMERS: SeedEndCustomer[] = [
  { customer: "C015", name: "太田モーター工業", industry: "自動車部品", contact: "石井 和也", notes: "プレスライン。防錆剤・切削油。" },
  { customer: "C015", name: "伊勢崎ダイカスト", industry: "自動車部品", contact: "石井 和也", notes: "離型剤・耐熱手袋。" },
  { customer: "C015", name: "高崎ギア製作所", industry: "自動車部品", contact: "前田 沙織", notes: "切削工具の消耗が多い。" },
  { customer: "C016", name: "藤沢電設工業", industry: "電気工事", contact: "三浦 健" },
  { customer: "C016", name: "湘南ハウジング", industry: "建設", contact: "大野 裕子", notes: "安全保護具の年次更新。" },
];

export const SUPPLIERS: SeedSupplier[] = [
  { code: "S01", name: "ホクト安全保護具株式会社", route_type: "maker", lead_time_days: 7, contact_email: "order@hokuto-safety.example.jp" },
  { code: "S02", name: "サンエイ梱包資材株式会社", route_type: "maker", lead_time_days: 5, contact_email: "eigyo@sanei-pack.example.jp" },
  { code: "S03", name: "東和切削工具株式会社", route_type: "maker", lead_time_days: 10, contact_email: "sales@towa-cut.example.jp", markup_rate: 1.25 },
  { code: "S04", name: "日新ケミカル株式会社", route_type: "maker", lead_time_days: 7, contact_email: "order@nisshin-chem.example.jp" },
  { code: "S05", name: "中央産業機材株式会社", route_type: "agency", lead_time_days: 3, contact_email: "uketsuke@chuo-sangyo.example.jp" },
  { code: "S06", name: "関東工具商会", route_type: "agency", lead_time_days: 2, contact_email: "info@kanto-kogu.example.jp" },
  { code: "S07", name: "大陸物産株式会社", route_type: "trading", lead_time_days: 1, contact_email: "hanbai@tairiku-bussan.example.jp" },
  { code: "S08", name: "テクノ空圧株式会社", route_type: "maker", lead_time_days: 14, contact_email: "order@techno-air.example.jp" },
];

// ratio = 定価に対する仕入れ率。メーカー直が最安・大ロット、代理店が中間、商社が高め・小ロット。
export const PRODUCTS: SeedProduct[] = [
  // 安全保護具（ホクト）
  { code: "P1001", part_number: "HG-12", name: "純綿軍手 12双組", maker: "ホクト安全", category: "安全保護具", unit: "組", list_price: 980, spec: "厚手・フリーサイズ", routes: [{ supplier: "S01", ratio: 0.52, min_lot: 50 }, { supplier: "S05", ratio: 0.6, min_lot: 10 }, { supplier: "S07", ratio: 0.68, min_lot: 1 }] },
  { code: "P1002", part_number: "HK-5L", name: "耐切創手袋 レベル5 L", maker: "ホクト安全", category: "安全保護具", unit: "双", list_price: 1850, spec: "EN388 カットレベル5", routes: [{ supplier: "S01", ratio: 0.5, min_lot: 20 }, { supplier: "S05", ratio: 0.58, min_lot: 5 }] },
  { code: "P1003", part_number: "HM-200", name: "保護メガネ 曇り止め", maker: "ホクト安全", category: "安全保護具", unit: "個", list_price: 1200, spec: "オーバーグラス対応", routes: [{ supplier: "S01", ratio: 0.5, min_lot: 10 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
  { code: "P1004", part_number: "HD-95", name: "防塵マスク DS2 10枚入", maker: "ホクト安全", category: "安全保護具", unit: "箱", list_price: 2400, spec: "国家検定 DS2", routes: [{ supplier: "S01", ratio: 0.55, min_lot: 10 }, { supplier: "S05", ratio: 0.62, min_lot: 2 }], revised: { from: "2026-04-01", ratio: 0.6 } },
  { code: "P1005", part_number: "HH-1W", name: "産業用ヘルメット 白", maker: "ホクト安全", category: "安全保護具", unit: "個", list_price: 3800, spec: "飛来落下・墜落時保護 兼用", routes: [{ supplier: "S01", ratio: 0.55, min_lot: 10 }, { supplier: "S06", ratio: 0.63, min_lot: 1 }] },
  { code: "P1006", part_number: "HS-26", name: "安全靴 26.0cm", maker: "ホクト安全", category: "安全保護具", unit: "足", list_price: 6500, spec: "JIS T8101 S種", routes: [{ supplier: "S01", ratio: 0.58, min_lot: 5 }, { supplier: "S06", ratio: 0.65, min_lot: 1 }] },
  // 梱包資材（サンエイ）
  { code: "P2001", part_number: "PB-15", name: "PPバンド 15.5mm×2500m", maker: "サンエイ梱包", category: "梱包資材", unit: "巻", list_price: 3200, spec: "手締め・機械兼用", routes: [{ supplier: "S02", ratio: 0.5, min_lot: 10 }, { supplier: "S07", ratio: 0.64, min_lot: 1 }] },
  { code: "P2002", part_number: "SF-500", name: "ストレッチフィルム 500mm×300m 6巻", maker: "サンエイ梱包", category: "梱包資材", unit: "箱", list_price: 5400, spec: "15μ・紙管3インチ", routes: [{ supplier: "S02", ratio: 0.48, min_lot: 20 }, { supplier: "S05", ratio: 0.56, min_lot: 5 }, { supplier: "S07", ratio: 0.63, min_lot: 1 }], revised: { from: "2026-02-01", ratio: 0.53 } },
  { code: "P2003", part_number: "YT-50", name: "養生テープ 50mm×25m 30巻", maker: "サンエイ梱包", category: "梱包資材", unit: "箱", list_price: 7500, spec: "緑・弱粘着", routes: [{ supplier: "S02", ratio: 0.52, min_lot: 5 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
  { code: "P2004", part_number: "OT-48", name: "OPPテープ 48mm×100m 50巻", maker: "サンエイ梱包", category: "梱包資材", unit: "箱", list_price: 6800, spec: "透明・48μ", routes: [{ supplier: "S02", ratio: 0.5, min_lot: 5 }, { supplier: "S05", ratio: 0.58, min_lot: 1 }] },
  { code: "P2005", part_number: "DB-120", name: "段ボール A式 120サイズ 20枚", maker: "サンエイ梱包", category: "梱包資材", unit: "束", list_price: 4200, spec: "450×350×350 K5", routes: [{ supplier: "S02", ratio: 0.55, min_lot: 10 }] },
  { code: "P2006", part_number: "AC-1200", name: "エアキャップ 1200mm×42m", maker: "サンエイ梱包", category: "梱包資材", unit: "巻", list_price: 3900, spec: "d37 2層", routes: [{ supplier: "S02", ratio: 0.52, min_lot: 5 }, { supplier: "S07", ratio: 0.67, min_lot: 1 }] },
  // 切削工具（東和）
  { code: "P3001", part_number: "EM-10-4F", name: "超硬エンドミル φ10 4枚刃", maker: "東和切削", category: "切削工具", unit: "本", list_price: 9800, spec: "TiAlNコート・鋼用", routes: [{ supplier: "S03", ratio: 0.55, min_lot: 5 }, { supplier: "S06", ratio: 0.62, min_lot: 1 }] },
  { code: "P3002", part_number: "DR-6-HSS", name: "ハイスドリル φ6.0 10本入", maker: "東和切削", category: "切削工具", unit: "箱", list_price: 7200, spec: "ストレートシャンク", routes: [{ supplier: "S03", ratio: 0.5, min_lot: 5 }, { supplier: "S06", ratio: 0.6, min_lot: 1 }, { supplier: "S07", ratio: 0.7, min_lot: 1 }] },
  { code: "P3003", part_number: "CT-16-P", name: "旋削チップ CNMG120408 10個入", maker: "東和切削", category: "切削工具", unit: "箱", list_price: 12000, spec: "鋼用ブレーカー P20", routes: [{ supplier: "S03", ratio: 0.52, min_lot: 5 }, { supplier: "S06", ratio: 0.6, min_lot: 1 }], revised: { from: "2026-04-01", ratio: 0.58 } },
  { code: "P3004", part_number: "BT-20", name: "外径バイトホルダ 20角", maker: "東和切削", category: "切削工具", unit: "本", list_price: 8500, spec: "CNMG用 右勝手", routes: [{ supplier: "S03", ratio: 0.55, min_lot: 2 }, { supplier: "S06", ratio: 0.63, min_lot: 1 }] },
  // 油脂・ケミカル（日新）
  { code: "P4001", part_number: "CO-18", name: "水溶性切削油 18L缶", maker: "日新ケミカル", category: "油脂・ケミカル", unit: "缶", list_price: 14000, spec: "エマルション型 希釈20倍", routes: [{ supplier: "S04", ratio: 0.55, min_lot: 4 }, { supplier: "S05", ratio: 0.62, min_lot: 1 }] },
  { code: "P4002", part_number: "RP-420", name: "防錆剤スプレー 420ml 24本", maker: "日新ケミカル", category: "油脂・ケミカル", unit: "箱", list_price: 16800, spec: "長期防錆 透明被膜", routes: [{ supplier: "S04", ratio: 0.52, min_lot: 2 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
  { code: "P4003", part_number: "CL-20", name: "工業用洗浄剤 20L", maker: "日新ケミカル", category: "油脂・ケミカル", unit: "缶", list_price: 9800, spec: "アルカリ性 脱脂用", routes: [{ supplier: "S04", ratio: 0.5, min_lot: 4 }, { supplier: "S05", ratio: 0.58, min_lot: 1 }] },
  { code: "P4004", part_number: "GR-400", name: "極圧グリース 400g 20本", maker: "日新ケミカル", category: "油脂・ケミカル", unit: "箱", list_price: 12000, spec: "リチウム系 No.2", routes: [{ supplier: "S04", ratio: 0.52, min_lot: 2 }, { supplier: "S06", ratio: 0.6, min_lot: 1 }] },
  { code: "P4005", part_number: "MR-420", name: "離型剤スプレー 420ml 24本", maker: "日新ケミカル", category: "油脂・ケミカル", unit: "箱", list_price: 15600, spec: "シリコン系 樹脂成形用", routes: [{ supplier: "S04", ratio: 0.5, min_lot: 2 }, { supplier: "S05", ratio: 0.58, min_lot: 1 }], revised: { from: "2026-07-01", ratio: 0.56 } },
  // 電設資材（代理店・商社のみ）
  { code: "P5001", part_number: "VVF-2.0-3C", name: "VVFケーブル 2.0mm 3芯 100m", maker: "東日本電線", category: "電設資材", unit: "巻", list_price: 18000, spec: "灰色 100m巻", routes: [{ supplier: "S05", ratio: 0.6, min_lot: 1 }, { supplier: "S07", ratio: 0.68, min_lot: 1 }], revised: { from: "2026-04-01", ratio: 0.66 } },
  { code: "P5002", part_number: "LF-50", name: "LED投光器 50W", maker: "ライトテック", category: "電設資材", unit: "台", list_price: 8900, spec: "昼光色 IP65", routes: [{ supplier: "S05", ratio: 0.55, min_lot: 1 }, { supplier: "S07", ratio: 0.65, min_lot: 1 }] },
  { code: "P5003", part_number: "ED-30", name: "電工ドラム 30m", maker: "ライトテック", category: "電設資材", unit: "台", list_price: 12500, spec: "4口 漏電遮断器付", routes: [{ supplier: "S06", ratio: 0.58, min_lot: 1 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
  { code: "P5004", part_number: "CB-300", name: "結束バンド 300mm 100本入", maker: "東日本電線", category: "電設資材", unit: "袋", list_price: 1100, spec: "ナイロン66 白", routes: [{ supplier: "S05", ratio: 0.5, min_lot: 10 }, { supplier: "S07", ratio: 0.62, min_lot: 1 }] },
  // 空圧機器（テクノ空圧）
  { code: "P6001", part_number: "AS-32-100", name: "エアシリンダ φ32 ST100", maker: "テクノ空圧", category: "空圧機器", unit: "本", list_price: 15800, spec: "複動 磁石付", routes: [{ supplier: "S08", ratio: 0.55, min_lot: 2, lead: 14 }, { supplier: "S05", ratio: 0.63, min_lot: 1, lead: 5 }] },
  { code: "P6002", part_number: "SV-24-5P", name: "電磁弁 5ポート DC24V", maker: "テクノ空圧", category: "空圧機器", unit: "個", list_price: 9600, spec: "シングルソレノイド", routes: [{ supplier: "S08", ratio: 0.55, min_lot: 2, lead: 14 }, { supplier: "S05", ratio: 0.62, min_lot: 1, lead: 5 }] },
  { code: "P6003", part_number: "AH-8-20", name: "エアホース φ8 20m", maker: "テクノ空圧", category: "空圧機器", unit: "巻", list_price: 4800, spec: "ウレタン 青", routes: [{ supplier: "S08", ratio: 0.5, min_lot: 5 }, { supplier: "S07", ratio: 0.65, min_lot: 1 }] },
  { code: "P6004", part_number: "FR-02", name: "フィルタレギュレータ 1/4", maker: "テクノ空圧", category: "空圧機器", unit: "個", list_price: 7400, spec: "圧力計付", routes: [{ supplier: "S08", ratio: 0.55, min_lot: 2 }, { supplier: "S05", ratio: 0.62, min_lot: 1 }] },
  // 清掃用品
  { code: "P7001", part_number: "WS-10", name: "白ウエス 10kg", maker: "サンエイ梱包", category: "清掃用品", unit: "袋", list_price: 5200, spec: "綿100% 中古布", routes: [{ supplier: "S02", ratio: 0.55, min_lot: 5 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
  { code: "P7002", part_number: "IW-500", name: "工業用ワイパー 500枚×6", maker: "サンエイ梱包", category: "清掃用品", unit: "箱", list_price: 8400, spec: "不織布 低発塵", routes: [{ supplier: "S02", ratio: 0.52, min_lot: 5 }, { supplier: "S05", ratio: 0.6, min_lot: 1 }] },
  { code: "P7003", part_number: "GB-90", name: "ゴミ袋 90L 半透明 300枚", maker: "サンエイ梱包", category: "清掃用品", unit: "箱", list_price: 6600, spec: "0.04mm厚", routes: [{ supplier: "S02", ratio: 0.5, min_lot: 5 }, { supplier: "S07", ratio: 0.63, min_lot: 1 }] },
  { code: "P7004", part_number: "OM-50", name: "油吸着マット 50cm角 100枚", maker: "日新ケミカル", category: "清掃用品", unit: "箱", list_price: 9900, spec: "油専用 撥水", routes: [{ supplier: "S04", ratio: 0.52, min_lot: 2 }, { supplier: "S05", ratio: 0.6, min_lot: 1 }] },
  // 作業工具
  { code: "P8001", part_number: "TW-100", name: "プリセット型トルクレンチ 20-100N·m", maker: "関東工具", category: "作業工具", unit: "本", list_price: 24000, spec: "差込角12.7", routes: [{ supplier: "S06", ratio: 0.6, min_lot: 1 }, { supplier: "S07", ratio: 0.68, min_lot: 1 }] },
  { code: "P8002", part_number: "DD-18", name: "充電式ドライバドリル 18V", maker: "パワーツール工業", category: "作業工具", unit: "台", list_price: 32000, spec: "バッテリ2個付", routes: [{ supplier: "S06", ratio: 0.62, min_lot: 1 }, { supplier: "S07", ratio: 0.7, min_lot: 1 }] },
  { code: "P8003", part_number: "NP-150", name: "強力ニッパー 150mm", maker: "関東工具", category: "作業工具", unit: "本", list_price: 2800, spec: "硬線対応", routes: [{ supplier: "S06", ratio: 0.55, min_lot: 5 }, { supplier: "S07", ratio: 0.65, min_lot: 1 }] },
  { code: "P8004", part_number: "MW-250", name: "モンキーレンチ 250mm", maker: "関東工具", category: "作業工具", unit: "本", list_price: 3400, spec: "開口36mm", routes: [{ supplier: "S06", ratio: 0.55, min_lot: 5 }, { supplier: "S07", ratio: 0.66, min_lot: 1 }] },
];

/** 業種ごとの「よく買うカテゴリ」と重み。 */
export const INDUSTRY_AFFINITY: Record<string, Record<string, number>> = {
  // ディーラーは上記の業種を名乗るが、扱いは幅広い（下の業種設定にフォールバック）
  自動車部品: { 切削工具: 5, "油脂・ケミカル": 4, 安全保護具: 3, 空圧機器: 3, 清掃用品: 2, 作業工具: 1 },
  食品製造: { 清掃用品: 5, 梱包資材: 4, 安全保護具: 4, 電設資材: 1, 作業工具: 1 },
  建設: { 安全保護具: 5, 作業工具: 4, 電設資材: 3, 梱包資材: 1 },
  物流: { 梱包資材: 5, 安全保護具: 3, 清掃用品: 2, 作業工具: 1, 電設資材: 1 },
  化学: { "油脂・ケミカル": 5, 安全保護具: 4, 清掃用品: 3, 空圧機器: 2 },
  電機: { 作業工具: 4, 電設資材: 4, 空圧機器: 3, 梱包資材: 2, 清掃用品: 2 },
};
