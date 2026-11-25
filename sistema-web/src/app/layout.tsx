import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { PwaUpdater } from "@/pwa/PwaUpdater";
import "./globals.css";

// Self-hosted at build time: the app keeps its fonts offline.
const display = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fredoka" });
const body = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nunito" });

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
