import { attachQuoteToDeal, commitImport, IMPORT_FIELDS, IMPORT_KIND_LABEL, loadImportMap, previewImport, refreshDealSummary, type ImportKind } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";
const KINDS = Object.keys(IMPORT_KIND_LABEL) as ImportKind[];

/** 取り込み種別と列定義、保存済みの列対応。 */
export async function GET(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get("kind") as ImportKind | null;
    const d = db();
    if (kind && KINDS.includes(kind)) return ok({ kind, fields: IMPORT_FIELDS[kind], saved: loadImportMap(d, kind) });
    return ok({ kinds: KINDS.map((k) => ({ kind: k, label: IMPORT_KIND_LABEL[k], fields: IMPORT_FIELDS[k], saved: loadImportMap(d, k) })) });
  } catch (e) { return fail(e); }
}

/**
 * multipart/form-data: file（CSV）, kind, mode（preview | commit）, mapping（commit 時、JSON {field: 列名}）
 * preview: 先頭 5 行と自動で当てた列対応を返す。commit: 取り込んで件数とエラー行を返す。
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") ?? "") as ImportKind;
    if (!KINDS.includes(kind)) return fail(new Error("取り込み種別が不正です"), 400);
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) return fail(new Error("CSV ファイルを選んでください"), 400);
    if (f.size > 20 * 1024 * 1024) return fail(new Error("ファイルが大きすぎます（20MB まで）"), 400);
    const buf = Buffer.from(await f.arrayBuffer());
    const d = db();
    const mode = String(form.get("mode") ?? "preview");
    if (mode === "commit") {
      let mapping: Record<string, string> = {};
      try { mapping = JSON.parse(String(form.get("mapping") ?? "{}")) as Record<string, string>; } catch { return fail(new Error("列の対応が読めません"), 400); }
      const res = commitImport(d, buf, kind, mapping);
      // 売上実績は受注済み見積りになる。案件から漏れないよう、古い順に案件へまとめる（AI は使わず決定的に）
      const dealIds = new Set<number>();
      for (const qid of res.quote_ids ?? []) dealIds.add((await attachQuoteToDeal(d, qid)).deal.id);
      for (const did of dealIds) await refreshDealSummary(d, did, { useAi: false });
      return ok({ ...res, deals: dealIds.size });
    }
    return ok(previewImport(d, buf, kind));
  } catch (e) { return fail(e); }
}
