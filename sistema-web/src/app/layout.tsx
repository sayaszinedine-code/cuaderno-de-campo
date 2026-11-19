import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuaderno de Campo",
  description: "Cuaderno de campo, notas y sesiones para docentes de Educación Inicial.",
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
      </body>
    </html>
  );
}
