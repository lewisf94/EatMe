import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon-180x180.png"],
      manifest: {
        name: "WhatToEat",
        short_name: "WhatToEat",
        description: "Track the jars and spices at the back of the cupboard.",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell + the scanner wasm so scanning works offline.
        globPatterns: ["**/*.{js,css,html,woff2,wasm,png,svg}"],
        navigateFallback: "/index.html",
        // Never serve the SPA shell for API calls.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8099",
    },
  },
  build: { outDir: "dist" },
});
