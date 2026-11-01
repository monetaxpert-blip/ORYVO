import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import Chrome from "@/components/Chrome";
import "./globals.css";

const archivo = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: "ORYVO — Track. Run. Achieve.",
  description:
    "Application sportive GPS premium : enregistrez vos sorties, mesurez distance, allure, vitesse et calories — même hors connexion.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ORYVO",
  },
};

export const viewport: Viewport = {
  themeColor: "#080808",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${archivo.variable} ${inter.variable}`}>
      <body className="bg-ink font-sans text-white antialiased">
        <div className="oryvo-ambience" aria-hidden />
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
