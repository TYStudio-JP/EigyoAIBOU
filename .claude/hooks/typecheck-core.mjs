// PostToolUse: packages/core を編集したら即座に型チェック（壊れた価格ロジックが Web/MCP に流れないように）
// Windows でも動くよう Node で書いている。
import { execSync } from "node:child_process";
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
let file = "";
try { file = JSON.parse(input)?.tool_input?.file_path ?? ""; } catch { /* ignore */ }
if (/packages[\\/]core[\\/].*\.ts$/.test(file)) {
  try {
    execSync("npx tsc -p packages/core --noEmit", { cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    console.log("営業AI棒 hook: packages/core の型チェック OK");
  } catch (e) {
    console.log("営業AI棒 hook: packages/core に型エラーがあります\n" + String(e.stdout ?? e.message).split("\n").slice(0, 20).join("\n"));
  }
}
