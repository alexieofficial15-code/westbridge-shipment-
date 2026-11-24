import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain (no layout shift).
const body = Inter({ subsets: ["latin"], variable: "--font-body-raw", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-raw", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name} | Track your shipment`, template: `%s | ${site.name}` },
  description: "Enter your tracking number and see where your shipment is right now. No account needed.",
  icons: { icon: "/brand/mark.png", apple: "/brand/mark.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c1626",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-white font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
