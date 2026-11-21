import type { Metadata, Viewport } from "next";
import { PwaUpdater } from "@/pwa/PwaUpdater";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuaderno de Campo",
  description: "Cuaderno de campo, notas y sesiones para docentes de Educación Inicial.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#1F7A6D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE">
      <body className="antialiased">
        {children}
        <PwaUpdater />
      </body>
    </html>
  );
}
