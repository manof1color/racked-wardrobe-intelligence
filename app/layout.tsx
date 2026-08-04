import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Racked — Wardrobe intelligence for better-fit products",
    template: "%s | Racked",
  },
  description: "Privacy-first AI wardrobe intelligence for people and emerging apparel brands.",
  openGraph: {
    title: "Racked — Sell what fits their real life.",
    description: "Explainable wardrobe intelligence for consumers and emerging apparel brands.",
    type: "website",
    images: [{ url:"/og.png", width:1536, height:1024, alt:"Racked explainable wardrobe intelligence" }],
  },
  twitter: {
    card:"summary_large_image",
    title:"Racked — Sell what fits their real life.",
    description:"Explainable wardrobe intelligence for consumers and emerging apparel brands.",
    images:["/og.png"],
  },
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
