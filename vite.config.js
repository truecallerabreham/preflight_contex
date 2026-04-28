import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: resolve("src/ui"),
  build: {
    outDir: resolve("dist/ui"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
