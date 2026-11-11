import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          refine: ["@refinedev/core", "@refinedev/react-router"],
          antd: ["antd", "@ant-design/icons"],
          flow: ["@xyflow/react"],
          editor: ["@uiw/react-codemirror", "@codemirror/lang-json"],
          charts: ["recharts"],
        },
      },
    },
  },
});
