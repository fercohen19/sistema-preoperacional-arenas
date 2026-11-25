import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arenas Transporte y Turismo",
  description: "Sistema de preoperacional y FUEC",
  applicationName: "Arenas Transporte y Turismo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Arenas Transporte"
  },
  icons: {
    icon: "/logo-arenas.png",
    apple: "/logo-arenas.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f2438"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
