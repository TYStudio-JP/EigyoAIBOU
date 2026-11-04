import Link from "next/link";
import { notFound } from "next/navigation";
import { contactEndCustomerMap, contactWorkload, crossSellCandidates, getCustomer, getProduct, getUser, hasApiKey, listDeals, listEndCustomers, listQuotes, listUsers, ownerHistory, purchasedProducts, CONTACT_STATUS_LABEL, CUSTOMER_KIND_LABEL } from "@eigyo/core";
import { currentUser } from "@/lib/user";
import { DealStatusBadge } from "@/components/deal-badge";
import { HandoverPanel } from "@/components/handover-panel";
import { db } from "@/lib/db";
import { Card, PageTitle, StatusBadge } from "@/components/ui";
import { CrossSellPanel } from "@/components/crosssell-panel";
import { PricingRuleForm } from "@/components/pricing-rule-form";
import { dateJp, yen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ contact?: string }> }) {
  const { id } = await params;
  const { contact: contactFilter } = await searchParams;
  const d = db();
  const c = getCustomer(d, Number(id));
  if (!c) notFound();
  const me = await currentUser(d);
  const workload = contactWorkload(d, c.id, 90);
  const ends = listEndCustomers(d, c.id);
  const endMap = contactEndCustomerMap(d, c.id);
  const dealsAll = listDeals(d, { customerId: c.id, limit: 300 });
  const deals = contactFilter ? dealsAll.filter((x) => String(x.contact_id ?? "none") === contactFilter) : dealsAll;
  const bought = purchasedProducts(d, c.id).map((b) => ({ ...b, product: getProduct(d, b.product_id)! })).sort((a, b) => b.last_date.localeCompare(a.last_date));
  const quotes = listQuotes(d, { customerId: c.id, limit: 30 });
  const cross = crossSellCandidates(d, c.id);
  return (
    <>
      <PageTitle title={c.name} sub={`${c.code}・${CUSTOMER_KIND_LABEL[c.kind]}・${c.industry}・${c.prefecture}・${c.payment_terms}・TEL ${c.tel ?? "-"}`} action={<Link href={`/customers/${c.id}/brief`} className="inline-flex items-center rounded-md bg-brand text-brand-ink px-3.5 py-2 text-sm font-medium">訪問前ブリーフ</Link>} />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="得意先メモ" className="lg:col-span-1"><p className="text-sm">{c.notes || "—"}</p></Card>
        <Card title="値付けルール（外出先でメーカー回答から即答するときの基準）" className="lg:col-span-3 hidden lg:block"><PricingRuleForm customer={{ id: c.id, pricing_mode: c.pricing_mode, markup_rate: c.markup_rate, margin_pct: c.margin_pct, rounding_unit: c.rounding_unit }} /></Card>
        <div className="lg:col-span-2"><HandoverPanel customerId={c.id} owner={c.owner_user_id ? getUser(d, c.owner_user_id) : null} users={listUsers(d, { includeInactive: true })} history={ownerHistory(d, c.id)} aiEnabled={hasApiKey()} meId={me?.id ?? null} /></div>
        <Card title={`担当者（${workload.length}）と対応量（直近90日）`} className="lg:col-span-3" action={<Link href={`/contacts/new?customer=${c.id}`} className="text-xs text-brand hover:underline">＋ 追加（名刺OK）</Link>}>
          {workload.length === 0 ? <p className="text-sm text-muted">担当者が未登録です。名刺を撮って追加してください。</p> : (
            <ul className="divide-y divide-line">
              {workload.map((w) => (
                <li key={w.contact.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Link href={`/contacts/${w.contact.id}`} className={`font-semibold hover:underline ${w.contact.status !== "active" ? "text-muted line-through" : ""}`}>{w.contact.name}</Link>
                  <span className="text-xs text-muted">{w.contact.department} {w.contact.title}</span>
                  {w.contact.status !== "active" && <span className="text-[11px] rounded bg-gray-100 px-1">{CONTACT_STATUS_LABEL[w.contact.status]}</span>}
                  <span className="text-xs num ml-auto">電話 {w.calls}・見積り {w.quotes}・案件 {w.deals}（進行中 {w.open_deals}）</span>
                  <span className="text-xs text-muted num">最終 {w.last_contact_at ? dateJp(w.last_contact_at) : "-"}</span>
                  <Link href={`/customers/${c.id}?contact=${w.contact.id}#deals`} className="text-xs text-brand hover:underline">案件を見る</Link>
                  {w.contact.notes && <div className="w-full text-xs text-muted">{w.contact.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {(c.kind === "dealer" || ends.length > 0) && (
          <Card title="納入先（得意先の得意先）と、誰がどこを見ているか" className="lg:col-span-3">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <ul className="space-y-1">{ends.map((e) => <li key={e.id}><b>{e.name}</b> <span className="text-xs text-muted">{e.industry}{e.notes ? "・" + e.notes : ""}</span></li>)}{ends.length === 0 && <li className="text-muted">未登録（案件の編集で納入先を設定できます）</li>}</ul>
              <ul className="space-y-1">{endMap.map((m) => <li key={m.contact_id ?? "none"}>{m.contact_name} → {m.end_customers.join("・") || "納入先の記録なし"} <span className="text-xs text-muted">（案件 {m.deals}）</span></li>)}</ul>
            </div>
          </Card>
        )}
        <Card title={`案件（${deals.length}${contactFilter ? "・担当者で絞り込み中" : ""}）`} className="lg:col-span-3" action={contactFilter ? <Link href={`/customers/${c.id}`} className="text-xs text-brand hover:underline">絞り込み解除</Link> : undefined}>
          <div id="deals" />
          {deals.length === 0 ? <p className="text-sm text-muted">案件なし</p> : (
            <ul className="divide-y divide-line">
              {deals.slice(0, 30).map((x) => (
                <li key={x.id}><Link href={`/deals/${x.id}`} className="flex items-center gap-2 py-2 text-sm"><DealStatusBadge status={x.status} /><span className="flex-1 min-w-0 truncate">{x.title}<span className="text-xs text-muted">　{x.contact?.name ?? ""}{x.end_customer ? `・${x.end_customer.name}` : ""}</span></span><span className="num w-24 text-right">{yen(x.amount)}</span><span className="text-xs text-muted num hidden sm:inline">{dateJp(x.last_activity_at)}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="購入中の商品（受注実績）" className="lg:col-span-2 overflow-x-auto">
          {bought.length === 0 ? <p className="text-sm text-muted">受注実績なし</p> : (
            <table className="w-full text-sm min-w-[32rem]">
              <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">商品</th><th className="text-left font-normal">カテゴリ</th><th className="text-right font-normal">累計数量</th><th className="text-right font-normal">直近単価</th><th className="text-right font-normal">直近</th></tr></thead>
              <tbody>{bought.map((b) => <tr key={b.product_id} className="border-t border-line"><td className="py-1">{b.product.name}</td><td className="text-muted">{b.category}</td><td className="text-right num">{b.total_qty}{b.product.unit}</td><td className="text-right num">{yen(b.last_price)}</td><td className="text-right num text-muted">{dateJp(b.last_date)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
      <div className="mb-4"><CrossSellPanel result={cross} aiEnabled={hasApiKey()} /></div>
      <Card title="見積り履歴" className="overflow-x-auto">
        <table className="w-full text-sm min-w-[32rem]">
          <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">見積番号</th><th className="text-left font-normal">件名</th><th className="text-right font-normal">金額</th><th className="text-left font-normal pl-4">状態</th><th className="text-left font-normal">失注理由</th><th className="text-right font-normal">更新</th></tr></thead>
          <tbody>{quotes.map((q) => <tr key={q.id} className="border-t border-line"><td className="py-1"><Link href={`/quotes/${q.id}`} className="text-brand hover:underline num">{q.quote_no}</Link></td><td className="text-muted">{q.subject}</td><td className="text-right num">{yen(q.total)}</td><td className="pl-4"><StatusBadge status={q.status} /></td><td className="text-xs text-muted">{q.lost_detail ?? ""}</td><td className="text-right num text-muted">{dateJp(q.updated_at)}</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}
