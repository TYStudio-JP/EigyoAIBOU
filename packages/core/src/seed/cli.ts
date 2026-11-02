import { defaultDbPath, openDb } from "../db/connection";
import { seedDatabase } from "./seed";

const path = defaultDbPath();
const db = openDb(path);
const result = seedDatabase(db);
console.log(`✔ ダミーデータを投入しました: ${path}`);
console.log(`  得意先 ${result.customers} / 仕入れ先 ${result.suppliers} / 商品 ${result.products} / 見積り ${result.quotes}`);
