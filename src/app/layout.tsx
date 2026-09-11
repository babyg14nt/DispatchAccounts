import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/toast";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "IRONHAUL — Carrier Operations OS",
  description:
    "Freight carrier command center: loads, BOLs, factoring, driver settlements, fleet maintenance, expenses and live P&L.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${jbMono.variable}`}>
      <body>
        <ToastProvider>
          <Sidebar />
          <div className="min-h-screen pt-16 lg:pl-[252px] lg:pt-0">
            <main className="mx-auto max-w-[1520px] px-4 pb-20 pt-5 sm:px-7 lg:pt-9">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
