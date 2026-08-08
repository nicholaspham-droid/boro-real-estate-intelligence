import type { Metadata } from "next";
import "./globals.css";
import "./sources.css";

export const metadata: Metadata = {
  title: "Borocast — U.S. Market Intelligence",
  description: "Public-data market intelligence across 20 U.S. metros, with tract-level demographic, economic, education and housing evidence.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "Borocast — U.S. Market Intelligence", description: "Slice and compare public-data evidence across 20 U.S. metros.", images: [{ url: "/og-national.png", width: 1659, height: 948 }] },
  twitter: { card: "summary_large_image", title: "Borocast — U.S. Market Intelligence", description: "Slice and compare public-data evidence across 20 U.S. metros.", images: ["/og-national.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
