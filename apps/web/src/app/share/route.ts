import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createShareItem } from "@eigyo/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Android の共有メニュー（PWA の share_target）から届く POST。テキスト・URL・ファイル（画像／PDF／Excel）を 1 時間だけ保管し、
 * 「見積り」「問い合わせ」「写真で調べる」を選ぶ画面へ送る。iPhone は共有ターゲットに非対応なのでコピペで同じ画面へ。
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = randomBytes(12).toString("hex");
  let file: { name: string; mime: string; blob: Buffer } | null = null;
  const f = form?.get("files") ?? form?.get("file");
  if (f instanceof File && f.size > 0 && f.size <= 10 * 1024 * 1024) file = { name: f.name, mime: f.type || "application/octet-stream", blob: Buffer.from(await f.arrayBuffer()) };
  createShareItem(db(), { token, title: String(form?.get("title") ?? ""), text: String(form?.get("text") ?? ""), url: String(form?.get("url") ?? ""), file_name: file?.name ?? null, file_mime: file?.mime ?? null, file_blob: file?.blob ?? null });
  return NextResponse.redirect(new URL(`/share/pick?t=${token}`, req.url), 303);
}

/** GET で開かれたら（iPhone やブラウザから直接）、空の選択画面へ。 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const text = u.searchParams.get("text") ?? u.searchParams.get("title") ?? "";
  if (!text) return NextResponse.redirect(new URL("/share/pick", req.url), 303);
  const token = randomBytes(12).toString("hex");
  createShareItem(db(), { token, text, url: u.searchParams.get("url") ?? "" });
  return NextResponse.redirect(new URL(`/share/pick?t=${token}`, req.url), 303);
}
