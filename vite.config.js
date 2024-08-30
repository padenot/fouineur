import { resolve } from "path";

// vite.config.js
export default {
  server: {
    hmr: false
  },
  build: {
    minify: false,
    sourcemap: true,
    // ensure if this is needed
    lib: {
      entry: resolve(__dirname, "background_script.js"),
      name: "plotter.js",
    },
    // critical: we want the format to be iife so that injecting
    // the content script multiple times works (e.g. invoking the
    // extension, dismissing the popup, re-invoking the extension)
    rollupOptions: {
      input: "src/main.ts",
     output: {
        inlineDynamicImports: true,
        format: "iife",
        name: "TBD",
        entryFileNames: `[name].js`,
        assetFileNames: `[name][extname]`,
      },
    },
  },
};
