import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: "./",
  plugins: [
    nodePolyfills({ include: ["buffer", "process"], globals: { Buffer: true, process: true } }),
  ],
});
