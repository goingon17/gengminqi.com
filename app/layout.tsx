import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Noto_Serif_SC } from "next/font/google";
import { profile } from "./content";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const serifZh = Noto_Serif_SC({ weight: "variable", variable: "--font-serif-zh", preload: false, display: "swap" });

const title = `${profile.name} — Public Key`;
const description = `${profile.tagline} WeChat: ${profile.wechat}`;

export const metadata: Metadata = {
  metadataBase: new URL(profile.url),
  title,
  description,
  openGraph: { title, description, type: "profile", url: profile.url },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable} ${serifZh.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
