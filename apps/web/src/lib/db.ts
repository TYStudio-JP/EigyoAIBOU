import "server-only";
import { listCustomers, openDb, seedDatabase, type Db } from "@eigyo/core";

/** Web アプリ用の DB 取得。空なら自動でダミーデータを投入する（初回起動の手間を無くす）。 */
export function db(): Db {
  const d = openDb();
  if (listCustomers(d).length === 0) seedDatabase(d);
  return d;
}
