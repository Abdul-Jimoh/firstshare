import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteFooter, SiteHeader } from "@/components/brand";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import "lenis/dist/lenis.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firstshare: your first stock, from $1",
  description: "Own a piece of Apple, Nvidia or the S&P 500 from $1. Tokenized US stocks on BNB Smart Chain, explained in plain English.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <noscript>
          <style>{"[data-animate]{visibility:visible!important}"}</style>
        </noscript>
      </head>
      <body className="min-h-dvh font-sans">
        <SmoothScroll />
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-5 sm:px-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
