import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@eigyo/core"],
  serverExternalPackages: ["exceljs", "@anthropic-ai/sdk"],
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
