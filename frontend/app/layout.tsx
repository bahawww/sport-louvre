import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
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
  themeColor: "#0B1117",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-dvh bg-[#0B1117] text-[#F1F5F9]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
