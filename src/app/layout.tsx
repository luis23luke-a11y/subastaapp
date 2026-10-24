import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subastas · buscador interno",
  description: "Buscador de subastas de inmuebles. Acceso restringido.",
  // Producto cerrado y con datos personales en los anuncios: nada de indexar.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-fondo text-texto antialiased">{children}</body>
    </html>
  );
}
