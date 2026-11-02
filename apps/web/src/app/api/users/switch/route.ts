import { NextResponse } from "next/server";
import { getUser } from "@eigyo/core";
import { db } from "@/lib/db";
import { USER_COOKIE } from "@/lib/user";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { user_id } = (await req.json()) as { user_id: number };
  const u = getUser(db(), user_id);
  if (!u) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const res = NextResponse.json(u);
  res.cookies.set(USER_COOKIE, String(u.id), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
