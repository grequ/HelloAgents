import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/chat": "http://localhost:8000",
      "/orders": "http://localhost:8000",
      "/workbench/interactions": "http://localhost:8000",
      "/workbench/agents": "http://localhost:8000",
      "/workbench/usecases": "http://localhost:8000",
      "/workbench/fetch-url": "http://localhost:8000",
      "/workbench/test-url": "http://localhost:8000",
      "/workbench/suggest-use-case": "http://localhost:8000",
      "/workbench/discover-endpoints": "http://localhost:8000",
      "/workbench/discover": "http://localhost:8000",
      "/workbench/test": "http://localhost:8000",
      "/workbench/generate-spec": "http://localhost:8000",
      "/workbench/specs": "http://localhost:8000",
      "/workbench/dashboard": "http://localhost:8000",
      "/workbench/settings": "http://localhost:8000",
      "/workbench/seed": "http://localhost:8000",
    },
  },
});
