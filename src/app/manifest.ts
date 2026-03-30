import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arenas Transporte y Turismo",
    short_name: "Arenas App",
    description: "Sistema operativo de preoperacional y FUEC para conductores y administradores.",
    start_url: "/login",
    display: "standalone",
    background_color: "#fcf8f1",
    theme_color: "#e9ae2b",
    lang: "es-CO",
    icons: [
      {
        src: "/logo-arenas.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
