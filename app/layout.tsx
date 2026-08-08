import type { Metadata } from "next";
import "./globals.css";
import "./sources.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://borocast-nyc-outlook.nicholas-pham.chatgpt.site"),
  title: "Borocast — U.S. Market Intelligence",
  description: "Public-data intelligence across 20 U.S. metros, combining tract-level fundamentals with measured FHFA home-price momentum.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "Borocast — U.S. Market Intelligence", description: "Compare fundamentals and measured home-price momentum across 20 U.S. metros.", images: [{ url: "/og-pricing.png", width: 1659, height: 948 }] },
  twitter: { card: "summary_large_image", title: "Borocast — U.S. Market Intelligence", description: "Compare fundamentals and measured home-price momentum across 20 U.S. metros.", images: ["/og-pricing.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
