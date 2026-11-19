import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Large libraries are split into their own files so browsers can cache them
// separately from the app code (which changes more often).
const VENDOR_CHUNKS: Record<string, string[]> = {
  "vendor-react": ["react", "react-dom", "react-router", "react-router-dom", "@remix-run/router", "scheduler"],
  "vendor-supabase": ["@supabase"],
  "vendor-motion": ["framer-motion", "motion-dom", "motion-utils"],
  "vendor-docx": ["docx"],
  "vendor-jspdf": ["jspdf", "html2canvas", "dompurify", "canvg"],
  "vendor-pptx": ["pptxgenjs"],
  "vendor-jszip": ["jszip"],
  "vendor-xlsx": ["xlsx"],
  "vendor-pdfjs": ["pdfjs-dist"],
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    // pdf.js and the Office export libraries are big by nature; they load on demand.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup's small CommonJS helpers are shared by many libraries; keep them
          // in their own file so the home page doesn't pull in a big library for them.
          if (id.includes("commonjsHelpers") || id.includes("vite/preload-helper")) return "cjs-helpers";
          if (!id.includes("node_modules")) return undefined;
          const path = id.split("node_modules/").pop() ?? "";
          for (const [chunk, pkgs] of Object.entries(VENDOR_CHUNKS)) {
            if (pkgs.some((p) => path === p || path.startsWith(p + "/"))) return chunk;
          }
          return undefined;
        },
      },
    },
  },
});
