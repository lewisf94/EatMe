import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // We ship our own service worker (src/sw.ts) so it can handle Web Push;
      // it still precaches the same shell, via the injected manifest.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon-180x180.png"],
      manifest: {
        name: "EatMe",
        short_name: "EatMe",
        description: "Track the jars and spices at the back of the cupboard.",
        theme_color: "#16130d",
        background_color: "#f4f1e8",
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
      injectManifest: {
        // Precache the app shell + the scanner wasm so scanning works offline.
        // (The navigation fallback and its /api denylist now live in sw.ts.)
        globPatterns: ["**/*.{js,css,html,woff2,wasm,png,svg}"],
        maximumFileSizeToCacheInBytes: 4_000_000, // the zxing wasm is ~1 MB
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
