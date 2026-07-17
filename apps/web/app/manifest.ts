import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VTK Tickets",
    short_name: "VTK Tickets",
    description: "Tickets en eventtoegang van VTK Leuven",
    start_url: "/tickets",
    display: "standalone",
    background_color: "#0a0f1f",
    theme_color: "#0a0f1f",
    icons: [
      {
        src: "/vtk-shield-favicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
