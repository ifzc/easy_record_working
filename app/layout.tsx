import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "./components/Header";
import AuthGuard from "./components/AuthGuard";
import NoticeProvider from "./components/NoticeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "易记工",
  description: "易记工 - 便捷方便的记工软件",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <NoticeProvider>
            <Header />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
              <AuthGuard>{children}</AuthGuard>
            </main>
            <footer className="border-t border-[color:var(--border)] py-4 text-center text-xs text-[color:var(--muted-foreground)]">
              @易记工
            </footer>
          </NoticeProvider>
        </div>
      </body>
    </html>
  );
}
