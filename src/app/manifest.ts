import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arenas Transporte y Turismo",
    short_name: "Arenas App",
    description: "Sistema operativo de preoperacional y FUEC para conductores y administradores.",
    start_url: "/login",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#0f2438",
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
