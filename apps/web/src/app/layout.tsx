import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "営業AI棒 — えいぎょうあいぼう",
  description: "ルート営業の見積り・価格確認・追跡・横展開提案・電話メモを肩代わりする営業アシスタント",
  applicationName: "営業AI棒",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "営業AI棒" },
  icons: { apple: "/apple-icon.png" },
};
export const viewport: Viewport = { themeColor: "#1f4e8c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <div className="lg:flex min-h-screen">
          <Nav />
          <main className="flex-1 min-w-0 px-4 pt-4 pb-24 lg:px-10 lg:py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
