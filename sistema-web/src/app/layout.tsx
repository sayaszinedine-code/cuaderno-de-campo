import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { PwaUpdater } from "@/pwa/PwaUpdater";
import "./globals.css";

// Variable fonts (every weight in one file), self-hosted at build time so the app keeps them offline.
// `next build` downloads them once, so building needs internet; the built app does not.
const display = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
const body = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "Cuaderno de Campo",
  description: "Cuaderno de campo, notas y sesiones para docentes de Educación Inicial.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#E0408F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        {children}
        <PwaUpdater />
      </body>
    </html>
  );
}
