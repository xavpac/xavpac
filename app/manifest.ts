import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XavPac",
    short_name: "XavPac",
    description: "Aviation, drone, météo, webcams et maison connectée.",
    start_url: "/spotter",
    display: "standalone",
    background_color: "#dfeff8",
    theme_color: "#dfeff8",
    orientation: "any",
    lang: "fr",
    categories: ["utilities", "navigation", "weather"],
    icons: [
      {
        src: "/xavpac-app.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ],
    shortcuts: [
      { name: "Trafic aérien", short_name: "Trafic", url: "/spotter?mode=avion" },
      { name: "Drone", short_name: "Drone", url: "/drone" },
      { name: "Mode Maison", short_name: "Maison", url: "/spotter?embed=home" }
    ]
  };
}
