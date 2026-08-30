import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gengminqi.com"),
  title: "隐私，仍可计算｜FHE 全同态加密",
  description: "从直觉、交互实验到数学原理，读懂全同态加密如何让机器在看不见数据的情况下完成计算。",
  openGraph: {
    title: "隐私，仍可计算｜gengminqi.com",
    description: "一份写给好奇者的全同态加密交互手记。",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "隐私，仍可计算——全同态加密科普",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "隐私，仍可计算｜gengminqi.com",
    description: "一份写给好奇者的全同态加密交互手记。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#24dd78",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
