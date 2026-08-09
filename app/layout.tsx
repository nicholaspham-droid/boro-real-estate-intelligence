import type { Metadata } from "next";
import "./globals.css";
import "./sources.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://borocast-nyc-outlook.nicholas-pham.chatgpt.site"),
  title: "BORO — Real Estate Intelligence",
  description: "Evidence-first real estate investment workbench across 20 U.S. markets: rank local areas, audit model quality, cross-check property values and underwrite deals.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "BORO — Real Estate Intelligence", description: "Rank local areas, audit valuation evidence and turn an actual deal into an explicit investment decision.", images: [{ url: "/og-pricing.png", width: 1659, height: 948 }] },
  twitter: { card: "summary_large_image", title: "BORO — Real Estate Intelligence", description: "Rank local areas, audit valuation evidence and underwrite an actual deal.", images: ["/og-pricing.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
