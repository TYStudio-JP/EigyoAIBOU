import { NextResponse } from "next/server";
import { AiUnavailableError } from "@eigyo/core";

export const dynamic = "force-dynamic";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
export function fail(e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  const code = e instanceof AiUnavailableError ? 424 : status;
  console.error("[api]", msg);
  return NextResponse.json({ error: msg }, { status: code });
}
export function idOf(params: { id: string }): number {
  const n = Number(params.id);
  if (!Number.isInteger(n) || n <= 0) throw new Error("invalid id");
  return n;
}
