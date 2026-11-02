import type { Db } from "../db/connection";
export const all_ = <T = Record<string, unknown>>(db: Db, sql: string, ...params: (string | number | null)[]): T[] =>
  (db.prepare(sql).all(...params) as unknown[]).map((r) => ({ ...(r as Record<string, unknown>) }) as T);
