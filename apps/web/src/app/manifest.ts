import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest & { share_target?: unknown } {
  return {
    name: "営業AI棒",
    short_name: "営業AI棒",
    description: "ルート営業の商談・訪問・電話以外を肩代わりする相棒",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#1f4e8c",
    lang: "ja",
    // Android: 「ホーム画面に追加」した営業AI棒が共有メニューに出る（HTTPS が条件。iPhone は非対応）
    share_target: { action: "/share", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: ["image/*", "application/pdf", ".xlsx", "text/plain"] }] } },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
