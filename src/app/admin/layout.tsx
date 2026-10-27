import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = { title: { default: "Practice dashboard", template: "%s · Practice dashboard" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} antialiased`}>
      <body className="min-h-dvh bg-paper">{children}</body>
    </html>
  );
}
