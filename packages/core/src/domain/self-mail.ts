/**
 * 自分宛てメール：営業AI棒は得意先に直接送らない。完成品（見積書・文面・チェック結果）を営業担当本人へメールし、
 * 本人がいつもの文面で得意先へ転送する（「自分にメールしてくれる事務員」）。
 * SMTP は .env の EIGYO_SMTP_* で設定。未設定ならスマホの共有メニュー／メールアプリに渡す。
 */
import nodemailer from "nodemailer";
import type { QuoteWithItems, Settings, User } from "./types";
import type { PriceCheck } from "./pricing";
import { isPendingFormal } from "./provisional";

export interface SelfMailConfig { host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string; defaultTo: string | null }

export function selfMailConfig(): SelfMailConfig | null {
  const host = process.env.EIGYO_SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.EIGYO_SMTP_PORT ?? 587);
  const user = process.env.EIGYO_SMTP_USER ?? null;
  return {
    host, port, secure: process.env.EIGYO_SMTP_SECURE === "1" || port === 465, user, pass: process.env.EIGYO_SMTP_PASS ?? null,
    from: process.env.EIGYO_SMTP_FROM ?? user ?? "eigyo-aibou@localhost", defaultTo: process.env.EIGYO_SELF_EMAIL ?? null,
  };
}
export const smtpConfigured = (): boolean => selfMailConfig() !== null;

/** 宛先：操作中ユーザーのメール → .env の EIGYO_SELF_EMAIL。 */
export function selfMailTo(me: Pick<User, "email"> | null): string | null {
  return me?.email || selfMailConfig()?.defaultTo || null;
}

export interface SelfMailPackage { subject: string; body: string; customer_subject: string; customer_body: string }

const jp = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).replace(/-/g, "/") : "-");
const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 見積書を自分宛てに送るときの件名・本文（得意先向け送付文の例＋チェック結果＋明細）。決定的テンプレート。 */
export function buildSelfMail(q: QuoteWithItems, settings: Settings, checks: { line_no: number; description: string; checks: PriceCheck[] }[], opts: { appUrl?: string; kind?: "formal" | "provisional"; provisionalText?: string | null } = {}): SelfMailPackage {
  const rep = settings.sales_rep.split(" ").pop() ?? settings.sales_rep;
  const tax = Math.round(q.total * settings.tax_rate);
  const customer_subject = `お見積書送付の件：${q.subject}（${q.quote_no}）`;
  const customer_body = [
    q.customer.name, q.customer.contact_name ? `${q.customer.contact_name} 様` : "ご担当者様", "",
    `いつもお世話になっております。${settings.company_name}の${rep}です。`,
    `「${q.subject}」のお見積書を添付にてお送りいたします。`, "",
    `・合計 ${yen(q.total)}（税抜）／ ${yen(q.total + tax)}（税込）`,
    `・納期 ${q.promised_delivery ? jp(q.promised_delivery) + " 予定" : "別途ご相談"}`,
    `・有効期限 ${jp(q.valid_until)}`,
    isPendingFormal(q) ? "先日ご連絡した内容を正式なお見積書にまとめました。" : "",
    "", "ご検討のほど、よろしくお願いいたします。", "", `${settings.company_name} ${settings.sales_rep}`, `TEL ${settings.company_tel}`,
  ].filter((l) => l !== "").join("\n");

  const warn = checks.flatMap((c) => c.checks.filter((x) => x.level === "warn" || x.level === "danger").map((x) => `・明細${c.line_no} ${c.description}：${x.title}`));
  const info = checks.flatMap((c) => c.checks.filter((x) => x.level === "info").map((x) => `・明細${c.line_no} ${c.description}：${x.title}`));
  const items = q.items.map((it) => `${it.line_no}. ${it.description}　${it.qty}${it.unit} × ${yen(it.unit_price)} = ${yen(it.qty * it.unit_price)}${it.cost ? `（仕入 ${yen(it.cost)}・粗利 ${it.unit_price ? Math.round(((it.unit_price - it.cost) / it.unit_price) * 100) : 0}%）` : ""}`);
  const kind = opts.kind ?? "formal";
  const subject = kind === "provisional"
    ? `【営業AI棒】暫定回答の控え：${q.customer.short_name}「${q.subject}」（${q.quote_no}）`
    : `【営業AI棒】見積書 ${q.quote_no} ${q.customer.short_name}「${q.subject}」— 転送用`;
  const body = [
    kind === "provisional" ? "▼ 得意先に伝えた暫定回答（控え）" : `▼ この見積書を ${q.customer.name}${q.customer.contact_name ? " " + q.customer.contact_name + " 様" : ""}${q.customer.contact_email ? `（${q.customer.contact_email}）` : ""} へ転送してください。添付：見積書（Excel）`,
    "",
    kind === "provisional" ? (opts.provisionalText ?? "") : `件名：${customer_subject}\n${"-".repeat(24)}\n${customer_body}\n${"-".repeat(24)}`,
    "",
    "▼ 営業AI棒のチェック",
    `粗利率 ${q.margin_pct.toFixed(1)}%（下限 ${settings.margin_floor_pct}% / 推奨 ${settings.margin_target_pct}%）`,
    warn.length ? `要確認：\n${warn.join("\n")}` : "要確認：なし",
    info.length ? `参考：\n${info.join("\n")}` : "",
    "",
    "▼ 明細",
    ...items,
    `小計 ${yen(q.total)}　消費税 ${yen(tax)}　合計 ${yen(q.total + tax)}`,
    "",
    opts.appUrl ? `営業AI棒で開く：${opts.appUrl}/quotes/${q.id}` : "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  return { subject, body, customer_subject, customer_body };
}

/** 自分宛てに送信する。SMTP 未設定なら例外。 */
export async function sendSelfMail(params: { to: string; cc?: string | null; subject: string; text: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<{ messageId: string }> {
  const cfg = selfMailConfig();
  if (!cfg) throw new Error("SMTP が未設定です（.env の EIGYO_SMTP_HOST など）");
  const transporter = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined });
  const info = await transporter.sendMail({ from: cfg.from, to: params.to, cc: params.cc ?? undefined, subject: params.subject, text: params.text, attachments: params.attachments });
  return { messageId: info.messageId };
}

/**
 * 代理送付（得意先へ直接）。既定では不可。ユーザー設定で許可した人だけ、画面で内容を確認して承認したときに限り送る。
 * 送信前に「許可・宛先・SMTP」を検証し、呼び出し側で履歴（mail_log・activity）を残す。
 */
export function proxySendPreconditions(me: Pick<User, "proxy_send_allowed"> | null, customerEmail: string | null): string | null {
  if (!me || !me.proxy_send_allowed) return "このユーザーは代理送付が許可されていません（設定 → ユーザーで許可できます）";
  if (!smtpConfigured()) return "SMTP が未設定のため代理送付できません";
  if (!customerEmail || !/\S+@\S+/.test(customerEmail)) return "得意先の担当者メールが未登録です";
  return null;
}
