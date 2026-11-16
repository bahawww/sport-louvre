import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sport Louvre · Football Transfer Value Intelligence",
  description:
    "Interactive ML dashboard for Transfermarkt 2025/2026 player market value trajectories: Clean vs Leakage classification, market value regression, error analysis, and scouting simulator.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={geist.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-ground text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
