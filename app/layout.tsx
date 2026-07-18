import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gengminqi.com"),
  title: "The Oath of Avalon",
  description: "A dealerless Avalon table where browsers keep the secrets and the server only carries sealed messages.",
  openGraph: {
    title: "The Oath of Avalon",
    description: "Trust no dealer. Keep every secret.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "The Oath of Avalon round table",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Oath of Avalon",
    description: "Trust no dealer. Keep every secret.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#120b08",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
