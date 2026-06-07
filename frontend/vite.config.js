import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
        // Strip /api prefix before sending to backend
        rewrite: (path) => path.replace(/^\/api/, ""),
        // Ensure Set-Cookie headers from backend are passed through correctly
        cookieDomainRewrite: "localhost",
      },
    },
  },
});
