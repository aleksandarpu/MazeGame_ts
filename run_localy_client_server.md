There are three ways to run it locally. None needs a Turso account, because without TURSO_DATABASE_URL the server uses a local file, data/mazegame.sqlite.

1. Development (hot reload) — two terminals:


npm install
npm run dev:server   # terminal 1: game server on http://localhost:3000
npm run dev          # terminal 2: Vite on http://localhost:5173
Open http://localhost:5173. Vite forwards the WebSocket (/ws) to the server. The server restarts itself when you change files in server/, and the page reloads when you change files in src/.

2. Production build (one process, like the real deployment)


npm run build
npm start            # http://localhost:3000 serves the page and the WebSocket
Don't set VITE_SERVER_URL when building for this, or the page will try to connect to that address instead of your local server.

3. Local server with the real Turso database — useful to test Turso before deploying. In PowerShell:


$env:TURSO_DATABASE_URL = "libsql://mazegame-<org>.turso.io"
$env:TURSO_AUTH_TOKEN = "<token>"
npm run dev:server
Then run npm run dev in a second terminal, as in option 1.

Tips

To play multiplayer on one computer, open two browser tabs and log in with a different name in each.
Alpha Room and Beta Room have fake players who are always ready, so you can start a game from a single tab.
To start over with empty data, stop the server and delete the data/ folder.