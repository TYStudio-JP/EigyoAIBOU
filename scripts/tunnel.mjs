// スマホから外出先でも使えるように、PC で動いている営業AI棒を HTTPS で公開する（Cloudflare の無料クイックトンネル）。
// 使い方: 別のターミナルで `npm run dev` を動かしたまま `npm run tunnel`。表示された https://xxxx.trycloudflare.com をスマホで開く。
// 注意: URL を知っている人は誰でも開けるので、.env の EIGYO_ACCESS_KEY を必ず設定すること。
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const { bin, install } = require("cloudflared");
const port = process.env.PORT ?? "3000";
let key = process.env.EIGYO_ACCESS_KEY ?? "";
if (!key && existsSync(".env")) {
  const m = readFileSync(".env", "utf8").match(/^EIGYO_ACCESS_KEY=(.+)$/m);
  if (m) key = m[1].trim();
}
if (!existsSync(bin)) { console.log("cloudflared をダウンロードしています…"); await install(bin); }
console.log(`PC の http://localhost:${port} を HTTPS で公開します。終了は Ctrl+C。`);
if (!key) console.log("⚠ EIGYO_ACCESS_KEY が未設定です。.env に設定してから `npm run dev` を再起動してください（誰でも開けてしまいます）。");
const child = spawn(bin, ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
const onData = (buf) => {
  const line = buf.toString();
  process.stderr.write(line);
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m) {
    console.log("\n==============================================");
    console.log(`スマホで開く URL（初回はこの URL でアクセスキーを渡す）:`);
    console.log(key ? `${m[0]}/?key=${encodeURIComponent(key)}` : m[0]);
    console.log(`Android の MacroDroid に設定する URL:`);
    console.log(`${m[0]}/api/calls/incoming?tel=[call_number]&duration=[call_duration]&direction=in${key ? `&key=${encodeURIComponent(key)}` : ""}`);
    console.log("==============================================\n");
  }
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.on("exit", (c) => process.exit(c ?? 0));
