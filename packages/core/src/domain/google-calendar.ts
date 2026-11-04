/**
 * Google カレンダー OAuth 連携（読み取り専用）。
 * - .env の GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が必要（Google Cloud で OAuth クライアントを作り、
 *   リダイレクト URI に {公開URL}/api/google/callback を登録）。
 * - refresh token はユーザー行（users.google_refresh_token）にだけ保存する。
 * - 取り込んだ予定は visits（source='ics'、external_id='google:<eventId>'）に入れ、iCal 取り込みと同じ扱いにする。
 */
import type { Db } from "../db/connection";
import { getUser, pruneIcsVisits, updateUser, upsertIcsVisit } from "./repo";
import { matchCustomerByText, stampOf, type IcsSyncResult } from "./visits";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email";
export function googleConfigured(): boolean { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
export const googleRedirectUri = (origin: string) => `${origin}/api/google/callback`;

export function googleAuthUrl(origin: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", googleRedirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const body = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...params });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20_000) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google 認証に失敗しました：${j.error_description ?? j.error ?? r.status}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in ?? 3600 };
}

/** 認可コードをトークンに交換し、ユーザーに保存する。 */
export async function googleConnect(db: Db, userId: number, code: string, origin: string): Promise<{ email: string | null }> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri(origin) });
  if (!t.refresh_token) throw new Error("refresh token が返りませんでした。Google アカウントの「サードパーティのアクセス」から営業AI棒を削除して、もう一度連携してください");
  let email: string | null = null;
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(10_000) });
    email = ((await r.json()) as { email?: string }).email ?? null;
  } catch { /* メールが取れなくても連携は成立 */ }
  updateUser(db, userId, { google_refresh_token: t.refresh_token, google_calendar_id: "primary", google_email: email });
  return { email };
}
export function googleDisconnect(db: Db, userId: number): void { updateUser(db, userId, { google_refresh_token: null, google_calendar_id: null, google_email: null }); }

export interface GoogleEvent { id: string; status?: string; summary?: string; location?: string; description?: string; start: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }
/** Google の予定 → visits の行（終日は 09:00、dateTime はローカル時刻へ）。 */
export function mapGoogleEvent(e: GoogleEvent): { external_id: string; title: string; starts_at: string; ends_at: string | null; place: string } | null {
  if (e.status === "cancelled") return null;
  const startS = e.start.dateTime ? stampOf(new Date(e.start.dateTime)) : e.start.date ? `${e.start.date} 09:00` : null;
  if (!startS) return null;
  const endS = e.end?.dateTime ? stampOf(new Date(e.end.dateTime)) : null;
  return { external_id: `google:${e.id}`, title: (e.summary ?? "（無題）").trim(), starts_at: startS, ends_at: endS, place: (e.location ?? "").trim() };
}

/** 保存済みの refresh token で予定を取得し、visits に取り込む（前 7 日〜30 日先、繰り返し予定は展開済み）。 */
export async function syncGoogleCalendar(db: Db, userId: number, now: Date = new Date()): Promise<IcsSyncResult & { email: string | null }> {
  const u = getUser(db, userId);
  if (!u?.google_refresh_token) throw new Error("Google カレンダーが未連携です");
  const t = await tokenRequest({ refresh_token: u.google_refresh_token, grant_type: "refresh_token" });
  const from = new Date(now); from.setDate(from.getDate() - 7);
  const to = new Date(now); to.setDate(to.getDate() + 30);
  const cal = encodeURIComponent(u.google_calendar_id ?? "primary");
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`);
    url.searchParams.set("timeMin", from.toISOString()); url.searchParams.set("timeMax", to.toISOString());
    url.searchParams.set("singleEvents", "true"); url.searchParams.set("orderBy", "startTime"); url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(20_000) });
    const j = (await r.json().catch(() => ({}))) as { items?: GoogleEvent[]; nextPageToken?: string; error?: { message?: string } };
    if (!r.ok) throw new Error(`Google カレンダーの取得に失敗しました：${j.error?.message ?? r.status}`);
    items.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  const fromS = stampOf(from), toS = stampOf(to);
  const keep = new Set<string>();
  let created = 0, updated = 0, matched = 0;
  for (const e of items) {
    const m = mapGoogleEvent(e);
    if (!m) continue;
    const customer = matchCustomerByText(db, `${m.title} ${m.place} ${e.description ?? ""}`);
    if (customer) matched++;
    const r = upsertIcsVisit(db, { user_id: userId, customer_id: customer?.id ?? null, ...m });
    r.created ? created++ : updated++;
    keep.add(m.external_id);
  }
  // Google 由来（google: 接頭辞）だけを対象に、消えた予定を削除
  const removed = pruneGoogleVisits(db, userId, keep, fromS, toS);
  return { fetched: keep.size, created, updated, removed, matched, from: fromS, to: toS, email: u.google_email };
}
function pruneGoogleVisits(db: Db, userId: number, keep: Set<string>, from: string, to: string): number {
  // pruneIcsVisits は ICS 全体を見るので、iCal URL 由来の予定を守るため google: 以外は keep に含める
  const rows = db.prepare("SELECT external_id FROM visits WHERE user_id=? AND source='ics' AND external_id NOT LIKE 'google:%' AND starts_at>=? AND starts_at<=?").all(userId, from, to) as { external_id: string }[];
  const all = new Set(keep); for (const r of rows) all.add(r.external_id);
  return pruneIcsVisits(db, userId, all, from, to);
}
