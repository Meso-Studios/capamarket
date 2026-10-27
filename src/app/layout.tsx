import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { SessionProvider, Shell } from "@/components/Session";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CapaMarket",
  description: "Credit-based prediction markets. No money, just foresight.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
