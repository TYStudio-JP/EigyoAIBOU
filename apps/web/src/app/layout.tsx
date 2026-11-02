import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "営業AI棒 — えいぎょうあいぼう",
  description: "ルート営業の見積り・価格確認・追跡・横展開提案を肩代わりする営業アシスタント",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 min-w-0 px-6 py-6 lg:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
