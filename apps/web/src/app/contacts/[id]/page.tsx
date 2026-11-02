import Link from "next/link";
import { notFound } from "next/navigation";
import { getContact, getCustomer, hasApiKey, listCalls, listCustomers, listDeals, listQuotes, CONTACT_STATUS_LABEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, Empty, PageTitle, StatusBadge } from "@/components/ui";
import { DealStatusBadge } from "@/components/deal-badge";
import { ContactForm } from "@/components/contact-form";
import { dateJp, yen } from "@/lib/format";
export const dynamic = "force-dynamic";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const d = db();
  const c = getContact(d, Number(id));
  if (!c) notFound();
  const cust = getCustomer(d, c.customer_id)!;
  const deals = listDeals(d, { contactId: c.id, limit: 100 });
  const calls = listCalls(d, { contactId: c.id, limit: 20 });
  const quotes = listQuotes(d, { contactId: c.id, limit: 20 });
  return (
    <>
      <PageTitle title={`${c.name}`} sub={<><Link href={`/customers/${cust.id}`} className="hover:underline">{cust.name}</Link>　{c.department} {c.title}　<span className={c.status === "active" ? "text-ok" : "text-warn"}>{CONTACT_STATUS_LABEL[c.status]}</span></>} action={<Link href={`/contacts/${c.id}?edit=1`} className="text-sm text-brand hover:underline">編集</Link>} />
      {edit && <div className="mb-4"><ContactForm customers={listCustomers(d)} contact={c} aiEnabled={hasApiKey()} /></div>}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="連絡先・メモ">
          <div className="text-sm space-y-1">
            <div>TEL {c.tel ? <a href={`tel:${c.tel}`} className="text-brand">{c.tel}</a> : "-"}</div>
            <div>携帯 {c.mobile ? <a href={`tel:${c.mobile}`} className="text-brand">{c.mobile}</a> : "-"}</div>
            <div>メール {c.email ? <a href={`mailto:${c.email}`} className="text-brand">{c.email}</a> : "-"}</div>
            <div className="text-muted text-xs pt-2 whitespace-pre-wrap">{c.notes || "メモなし"}</div>
          </div>
        </Card>
        <Card title={`案件（${deals.length}）`} className="lg:col-span-2">
          {deals.length === 0 ? <Empty>案件なし</Empty> : <ul className="divide-y divide-line">{deals.map((x) => <li key={x.id}><Link href={`/deals/${x.id}`} className="flex items-center gap-2 py-2"><span className="flex-1 min-w-0 truncate">{x.title}{x.end_customer ? <span className="text-xs text-muted">　納入先 {x.end_customer.name}</span> : null}</span><DealStatusBadge status={x.status} /><span className="num text-sm w-24 text-right">{yen(x.amount)}</span></Link></li>)}</ul>}
        </Card>
        <Card title="電話" className="lg:col-span-1">{calls.length === 0 ? <Empty>なし</Empty> : <ul className="divide-y divide-line text-sm">{calls.map((x) => <li key={x.id}><Link href={`/calls/${x.id}`} className="block py-2"><span className="text-xs text-muted num">{x.started_at.slice(0, 16)}</span><div className="truncate">{x.minutes?.summary.split("\n")[0].replace(/^・/, "") ?? x.memo.slice(0, 50) ?? "メモ未入力"}</div></Link></li>)}</ul>}</Card>
        <Card title="見積り" className="lg:col-span-2">{quotes.length === 0 ? <Empty>なし</Empty> : <ul className="divide-y divide-line text-sm">{quotes.map((q) => <li key={q.id}><Link href={`/quotes/${q.id}`} className="flex items-center gap-2 py-2"><span className="num text-brand">{q.quote_no}</span><span className="flex-1 truncate text-muted">{q.subject}</span><StatusBadge status={q.status} /><span className="num w-24 text-right">{yen(q.total)}</span><span className="text-xs text-muted num">{dateJp(q.updated_at)}</span></Link></li>)}</ul>}</Card>
      </div>
    </>
  );
}
