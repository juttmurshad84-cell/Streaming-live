import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { FixtureNotice } from "@/components/blocks";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "ArenaLive — Live sports streams & replays", template: "%s · ArenaLive" },
  description: "Watch live sports streams, upcoming fixtures and replays from creators and rights-holders.",
  openGraph: { siteName: "ArenaLive", type: "website" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: "#080B12", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2">Skip to content</a>
        <FixtureNotice />
        <Navbar />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
