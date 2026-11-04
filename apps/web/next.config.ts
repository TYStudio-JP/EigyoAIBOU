import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// リポジトリ直下の .env（ANTHROPIC_API_KEY など）を読む。Next は apps/web/.env しか見ないため。既に設定済みの環境変数は上書きしない。
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  transpilePackages: ["@eigyo/core"],
  serverExternalPackages: ["exceljs", "@anthropic-ai/sdk", "nodemailer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
