// PreToolUse(Bash): 本番 DB ファイル（data 配下の .db）を直接消す・テーブルを落とすコマンドを止める。
// ダミーデータの入れ直しは `npm run seed` を使う。
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
let cmd = "";
try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { /* ignore */ }
const dangerous = /(^|[;&|]\s*)(rm|del|unlink)\s[^;&|\n]*eigyo\.db|DROP\s+TABLE|DELETE\s+FROM\s+(quotes|customers|products)\b/i;
if (dangerous.test(cmd)) {
  console.error("営業AI棒 hook: DB を直接消すコマンドはブロックしました。ダミーデータの入れ直しは npm run seed を使ってください。");
  process.exit(2);
}
