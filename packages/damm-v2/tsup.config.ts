import { defineConfig } from "tsup";

// One entry per component so each can be imported on its own, e.g. "@lpkit-sol/damm-v2/classify".
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "classify/index": "src/classify/index.ts",
    "presets/index": "src/presets/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
});
