import type { Metadata } from "next";
import { PwaInstall } from "@/components/pwa-install";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Racked — Wardrobe intelligence for better-fit products",
    template: "%s | Racked",
  },
  description: "Privacy-first AI wardrobe intelligence for people and emerging apparel brands.",
  manifest:"/manifest.webmanifest",
  applicationName:"Racked",
  appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"Racked"},
  icons:{icon:[{url:"/icon-192.png",sizes:"192x192",type:"image/png"},{url:"/icon-512.png",sizes:"512x512",type:"image/png"}],apple:[{url:"/apple-touch-icon.png",sizes:"180x180",type:"image/png"}]},
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
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}<PwaInstall /></body>
    </html>
  );
}
