import { getShareFile, hasApiKey, identifyProduct, readProductPhoto } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../../_util";

export const dynamic = "force-dynamic";
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** 写真（multipart の file、または共有メニューの share_token）から商品を読み取り、自社マスタと照合する。 */
export async function POST(req: Request) {
  try {
    if (!hasApiKey()) return fail(new Error("写真の読み取りには AI 接続が必要です（設定で API キーを登録）"), 424);
    const form = await req.formData();
    const hint = String(form.get("hint") ?? "");
    let buf: Buffer | null = null; let mime = "";
    const f = form.get("file");
    if (f instanceof File && f.size > 0) { buf = Buffer.from(await f.arrayBuffer()); mime = f.type; }
    else if (form.get("share_token")) { const s = getShareFile(db(), String(form.get("share_token"))); if (s) { buf = s.blob; mime = s.mime; } }
    if (!buf) return fail(new Error("写真を選んでください"), 400);
    if (!TYPES.has(mime)) return fail(new Error("JPEG / PNG / WebP / GIF の画像を選んでください（HEIC は端末の設定で「互換性優先」にすると JPEG で保存されます）"), 400);
    if (buf.length > 8 * 1024 * 1024) return fail(new Error("画像が大きすぎます（8MB まで）"), 400);
    const reading = await readProductPhoto({ media_type: mime as "image/jpeg", base64: buf.toString("base64") }, hint || undefined);
    return ok(identifyProduct(db(), reading));
  } catch (e) { return fail(e); }
}
