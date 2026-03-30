import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arenas Transporte y Turismo",
  description: "Sistema de preoperacional y FUEC",
  applicationName: "Arenas Transporte y Turismo",
  manifest: "/manifest.webmanifest",
  themeColor: "#e9ae2b",
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
