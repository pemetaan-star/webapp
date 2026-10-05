import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pemetaan Hotspot Malang",
    short_name: "Pemetaan Hotspot",
    description: "Pendataan dan pemantauan hotspot Kota Malang.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1717d9",
    icons: [
      {
        src: "/icons/lingga-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/lingga-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
