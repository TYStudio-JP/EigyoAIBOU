/**
 * 訪問予定：アプリ内で入力するか、カレンダーの非公開 iCal URL から取り込む。
 * ホームは「次の訪問まで N 分以内」なら訪問前ブリーフ、それ以外は返事待ちを先頭にする。
 */
import type { Db } from "../db/connection";
import { findCustomer, getSettings, getUser, listCustomers, listVisits, pruneIcsVisits, upsertIcsVisit } from "./repo";
import type { Customer, VisitWithCustomer } from "./types";

const p2 = (n: number) => String(n).padStart(2, "0");
/** Date → "YYYY-MM-DD HH:MM"（ローカル時刻）。 */
export function stampOf(d: Date): string { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export function dateOf(stamp: string): Date { const [d, t = "00:00"] = stamp.split(" "); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(y, m - 1, dd, hh, mm, 0, 0); }

// ---------- iCal ----------
export interface IcsEvent { uid: string; summary: string; location: string; description: string; starts_at: string; ends_at: string | null; all_day: boolean }

/** iCal テキストから VEVENT を取り出す（折り返し行・TZID・UTC・終日に対応。RRULE の展開はしない）。 */
export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const events: IcsEvent[] = [];
  let cur: Record<string, { params: Record<string, string>; value: string }> | null = null;
  for (const line of unfolded.split("\n")) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur) { const ev = toEvent(cur); if (ev) events.push(ev); } cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i); const value = line.slice(i + 1);
    const [name, ...ps] = head.split(";");
    const params: Record<string, string> = {};
    for (const p of ps) { const [k, v] = p.split("="); if (k && v !== undefined) params[k.toUpperCase()] = v; }
    cur[name.toUpperCase()] = { params, value };
  }
  return events;
}
function icsDate(v: string, params: Record<string, string>): { stamp: string; allDay: boolean } | null {
  const allDay = params.VALUE === "DATE" || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "09", mm = "00", , z] = m;
  if (z) { const dt = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm)); return { stamp: stampOf(dt), allDay }; }
  return { stamp: `${y}-${mo}-${d} ${allDay ? "09:00" : `${hh}:${mm}`}`, allDay };
}
const unescapeIcs = (s: string) => s.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
function toEvent(f: Record<string, { params: Record<string, string>; value: string }>): IcsEvent | null {
  const ds = f.DTSTART ? icsDate(f.DTSTART.value, f.DTSTART.params) : null;
  if (!ds || !f.UID) return null;
  const de = f.DTEND ? icsDate(f.DTEND.value, f.DTEND.params) : null;
  if ((f.STATUS?.value ?? "").toUpperCase() === "CANCELLED") return null;
  return { uid: f.UID.value.trim(), summary: unescapeIcs(f.SUMMARY?.value ?? "（無題）"), location: unescapeIcs(f.LOCATION?.value ?? ""), description: unescapeIcs(f.DESCRIPTION?.value ?? ""), starts_at: ds.stamp, ends_at: de && !ds.allDay ? de.stamp : null, all_day: ds.allDay };
}

/** 予定のタイトル・場所から得意先を推定する（社名・略称・担当者名の部分一致。最も長く一致したもの）。 */
export function matchCustomerByText(db: Db, text: string): Customer | null {
  const hay = text.replace(/\s+/g, "");
  if (!hay) return null;
  let best: { c: Customer; len: number } | null = null;
  for (const c of listCustomers(db)) {
    const keys = [c.name, c.short_name, c.name.replace(/株式会社|有限会社|合同会社/g, "")].filter((k) => k.length >= 2);
    for (const k of keys) if (hay.includes(k.replace(/\s+/g, "")) && (!best || k.length > best.len)) best = { c, len: k.length };
  }
  if (best) return best.c;
  // 「〇〇様」「〇〇さん」の担当者名から
  const m = text.match(/([^\s　、,]{2,8})(?:様|さん)/);
  if (m) { const hits = findCustomer(db, m[1]); if (hits.length === 1) return hits[0]; }
  return null;
}

export interface IcsSyncResult { fetched: number; created: number; updated: number; removed: number; matched: number; from: string; to: string }
/** iCal テキストを取り込む（前後 30 日）。同じ UID は更新、消えた予定は削除。 */
export function syncIcsText(db: Db, userId: number, text: string, now: Date = new Date()): IcsSyncResult {
  const from = new Date(now); from.setDate(from.getDate() - 7);
  const to = new Date(now); to.setDate(to.getDate() + 30);
  const fromS = stampOf(from), toS = stampOf(to);
  const events = parseIcs(text).filter((e) => e.starts_at >= fromS && e.starts_at <= toS);
  const keep = new Set<string>();
  let created = 0, updated = 0, matched = 0;
  for (const e of events) {
    const customer = matchCustomerByText(db, `${e.summary} ${e.location} ${e.description}`);
    if (customer) matched++;
    const r = upsertIcsVisit(db, { user_id: userId, external_id: e.uid, title: e.summary, starts_at: e.starts_at, ends_at: e.ends_at, place: e.location, customer_id: customer?.id ?? null });
    r.created ? created++ : updated++;
    keep.add(e.uid);
  }
  const removed = pruneIcsVisits(db, userId, keep, fromS, toS);
  return { fetched: events.length, created, updated, removed, matched, from: fromS, to: toS };
}

/** 社内・ループバック・メタデータなど、外部カレンダーとしてあり得ないホスト（SSRF 対策）。 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "::1" || h === "0.0.0.0") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^(fc|fd|fe80)/.test(h); // IPv6 ULA / link-local
}

/** iCal URL を取得して取り込む（https のみ。ユーザー自身のカレンダー URL）。 */
export async function syncIcsFromUrl(db: Db, userId: number, url?: string | null): Promise<IcsSyncResult> {
  const u = url ?? getUser(db, userId)?.calendar_ics_url;
  if (!u) throw new Error("カレンダーの iCal URL が未設定です（訪問予定の画面で設定）");
  let parsed: URL;
  try { parsed = new URL(u.replace(/^webcal:/i, "https:")); } catch { throw new Error("iCal URL の形式が不正です"); }
  if (parsed.protocol !== "https:") throw new Error("iCal URL は https で指定してください");
  if (isPrivateHost(parsed.hostname)) throw new Error("社内アドレスは取り込み元に指定できません");
  const res = await fetch(parsed, { headers: { Accept: "text/calendar" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`カレンダーを取得できませんでした（HTTP ${res.status}）`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("取得した内容が iCal 形式ではありません（非公開 URL の「iCal 形式」を使ってください）");
  return syncIcsText(db, userId, text);
}

// ---------- ホームの切替 ----------
export interface NextVisit { visit: VisitWithCustomer; minutes_until: number; in_progress: boolean }
/** 次の訪問（進行中なら開始から 90 分まではそれ）。 */
export function nextVisit(db: Db, userId: number | null, now: Date = new Date()): NextVisit | null {
  const nowS = stampOf(now);
  const dayStart = nowS.slice(0, 10) + " 00:00";
  const list = listVisits(db, { userId, from: dayStart, limit: 50 });
  for (const v of list) {
    const start = dateOf(v.starts_at).getTime();
    const end = v.ends_at ? dateOf(v.ends_at).getTime() : start + 60 * 60_000;
    const minutes = Math.round((start - now.getTime()) / 60_000);
    if (minutes >= 0) return { visit: v, minutes_until: minutes, in_progress: false };
    if (now.getTime() <= Math.max(end, start + 90 * 60_000)) return { visit: v, minutes_until: minutes, in_progress: true };
  }
  return null;
}
export type HomeMode = "brief" | "inbox";
/** 訪問まで設定分以内（または訪問中）なら brief、それ以外は inbox。 */
export function homeMode(db: Db, userId: number | null, now: Date = new Date()): { mode: HomeMode; next: NextVisit | null; switch_minutes: number } {
  const switch_minutes = getSettings(db).brief_switch_minutes;
  const next = nextVisit(db, userId, now);
  const mode: HomeMode = next && next.visit.customer_id && next.minutes_until <= switch_minutes ? "brief" : "inbox";
  return { mode, next, switch_minutes };
}
