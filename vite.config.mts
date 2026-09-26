import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    // In development the page comes from Vite (port 5173) and the game server
    // (npm run dev:server) runs on port 3000; forward its WebSocket there.
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
