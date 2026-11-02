import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "営業AI棒",
    short_name: "営業AI棒",
    description: "ルート営業の商談・訪問・電話以外を肩代わりする相棒",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1f4e8c",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
