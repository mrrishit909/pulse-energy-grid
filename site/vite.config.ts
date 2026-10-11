/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { statSync } from "node:fs";

export default defineConfig({
  base: "/pulse-energy-grid/",
  // no SPA fallback: a missing artifact is a real 404, as on GitHub Pages
  appType: "mpa",
  plugins: [react(), tailwindcss()],
  build: { target: "es2022", sourcemap: false },
  // the HiGHS solver runs in a module worker (MOTION_SYSTEM 9.1)
  worker: { format: "es" },
  // raw wasm size for honest byte progress when the server compresses (Content-Length is then the gzip size)
  define: { __HIGHS_WASM_BYTES__: statSync(new URL("./node_modules/highs/build/highs.wasm", import.meta.url)).size },
  preview: { port: 4331, strictPort: true },
  test: { include: ["src/**/*.test.ts"], environment: "node", testTimeout: 120_000 },
});
