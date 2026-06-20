import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Static SPA build → dist/. The scheme snapshot (~1.2MB) is loaded lazily at
// runtime (see SPEC §9 / HANDOFF), so it is served from public/ rather than
// bundled into the main chunk.
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the containerized verification browser to reach the dev server.
    allowedHosts: ["host.docker.internal"],
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
