import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // The API port comes from the root .env, the same file the server reads, so changing PORT there
  // moves both ends together.
  const env = loadEnv(mode, "..", "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": `http://localhost:${env.PORT || 3001}`,
      },
    },
  };
});
