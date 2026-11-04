import { addActivity, addDealEvent, addMailLog, buildSelfMail, getQuote, getSettings, proxySendPreconditions, quoteToExcel, selfMailTo, sendSelfMail, smtpConfigured } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { quoteLineChecks } from "@/lib/quote-checks";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * 送信（既定は自分宛て。得意先には送らない）。
 * - GET: 件名・本文のプレビュー、SMTP の可否、宛先、代理送付の可否。
 * - POST kind=formal|provisional: SMTP で自分宛てに送信（見積書 Excel を添付）。SMTP 未設定なら 424 と文面を返し、画面側は共有メニュー／メールアプリへ。
 * - POST kind=customer: 代理送付。ユーザー設定で許可され、画面で内容を確認して confirm=true のときだけ得意先へ送る（CC に自分）。履歴を残す。
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const me = await currentUser(d);
    const kind = (new URL(req.url).searchParams.get("kind") === "provisional" ? "provisional" : "formal") as "formal" | "provisional";
    const pkg = buildSelfMail(q, getSettings(d), quoteLineChecks(d, q), { appUrl: new URL(req.url).origin, kind, provisionalText: q.provisional_text });
    const customerEmail = q.customer.contact_email;
    const proxyBlock = proxySendPreconditions(me, customerEmail);
    return ok({ ...pkg, smtp: smtpConfigured(), to: selfMailTo(me), proxy: { allowed: !proxyBlock, reason: proxyBlock, to: customerEmail } });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const me = await currentUser(d);
    const b = (await req.json().catch(() => ({}))) as { kind?: "formal" | "provisional" | "customer"; to?: string; confirm?: boolean };
    const settings = getSettings(d);
    const origin = new URL(req.url).origin;

    if (b.kind === "customer") {
      // 代理送付：許可・SMTP・宛先・明示的な確認の 4 つが揃ったときだけ
      const block = proxySendPreconditions(me, q.customer.contact_email);
      if (block) return fail(new Error(block), 403);
      if (b.confirm !== true) return fail(new Error("内容を確認して「送信する」を押してください"), 400);
      const pkg = buildSelfMail(q, settings, quoteLineChecks(d, q), { appUrl: origin, kind: "formal" });
      const to = q.customer.contact_email!;
      const cc = selfMailTo(me);
      const attachments = [{ filename: `見積書_${q.quote_no}_${q.customer.short_name}.xlsx`, content: await quoteToExcel(q, settings), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }];
      const r = await sendSelfMail({ to, cc, subject: pkg.customer_subject, text: pkg.customer_body, attachments });
      addMailLog(d, { quote_id: q.id, user_id: me?.id ?? null, kind: "customer", to_addr: to, cc_addr: cc, subject: pkg.customer_subject });
      addActivity(d, id, "mail", `【代理送付】見積書を得意先（${to}）へ送信（CC ${cc ?? "-"}）。承認: ${me?.name ?? "-"}`);
      if (q.deal_id) addDealEvent(d, q.deal_id, "mail", `見積書 ${q.quote_no} を得意先へ代理送付（${me?.name ?? "-"} が承認）`, { type: "quote", id: q.id });
      return ok({ sent: true, to, cc, messageId: r.messageId });
    }

    const kind = b.kind === "provisional" ? "provisional" : "formal";
    const pkg = buildSelfMail(q, settings, quoteLineChecks(d, q), { appUrl: origin, kind, provisionalText: q.provisional_text });
    const to = (b.to && /\S+@\S+/.test(b.to) ? b.to : null) ?? selfMailTo(me);
    if (!smtpConfigured()) return Response.json({ error: "SMTP が未設定です。共有メニューかメールアプリで自分宛てに送ってください。", smtp: false, to, ...pkg }, { status: 424 });
    if (!to) return fail(new Error("宛先が未設定です。設定でユーザーのメールアドレスを登録するか、.env に EIGYO_SELF_EMAIL を設定してください。"), 400);
    const attachments = kind === "formal" ? [{ filename: `見積書_${q.quote_no}_${q.customer.short_name}.xlsx`, content: await quoteToExcel(q, settings), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] : [];
    const r = await sendSelfMail({ to, subject: pkg.subject, text: pkg.body, attachments });
    addMailLog(d, { quote_id: q.id, user_id: me?.id ?? null, kind: "self", to_addr: to, subject: pkg.subject });
    addActivity(d, id, "mail", `${kind === "formal" ? "見積書" : "暫定回答の控え"}を自分宛て（${to}）に送信`);
    return ok({ sent: true, to, messageId: r.messageId });
  } catch (e) { return fail(e); }
}
