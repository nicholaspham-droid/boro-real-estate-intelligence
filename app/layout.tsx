import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Borocast — NYC Property Outlook",
  description: "A transparent, data-driven ranking of projected NYC neighborhood property value signals.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "Borocast — NYC Property Outlook", description: "Five-year value signals across New York City neighborhoods.", images: [{ url: "/og.png", width: 1792, height: 1024 }] },
  twitter: { card: "summary_large_image", title: "Borocast — NYC Property Outlook", description: "Five-year value signals across New York City neighborhoods.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
