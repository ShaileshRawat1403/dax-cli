import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000, // Frontend runs on port 3000
    proxy: {
      // Proxy /api requests to the backend server
      "/api": {
        target: "http://localhost:4096", // Backend API server
        changeOrigin: true,
      },
    },
  },
});
