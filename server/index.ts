import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { openDb } from "./db";
import { Changes, cleanName, RequestError, Store } from "./store";
import type { ClientMessage, ServerMessage, Topic } from "../src/protocol";

// The game server (deployed on Railway): runs the rooms and games over WebSockets
// at /ws. Presence is the WebSocket itself: a closed tab closes its socket, and a
// heartbeat (ping / pong) catches connections that die silently. A user who drops
// out gets RECONNECT_GRACE_MS to come back (connection.ts resumes with its token)
// before they are removed from their room.
// It also serves the built client from dist/ if there is one (local testing; in
// production the client is on Vercel), and GET /health for Railway's health check.
// Run a single instance: the operation queue and the connections live in memory.

const PORT = Number(process.env.PORT ?? 3000);
// Turso in production; a local SQLite file otherwise
const DATABASE_URL = process.env.TURSO_DATABASE_URL ||
  "file:" + path.resolve(__dirname, "../data/mazegame.sqlite").replace(/\\/g, "/");
const DATABASE_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;
const DIST_DIR = path.resolve(__dirname, "../dist");
// Page origins allowed to open a WebSocket, comma separated; "*" matches any part of a
// host name, e.g. "https://mazegame.vercel.app,https://mazegame-*.vercel.app".
// The server's own host and localhost are always allowed.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  .map((pattern) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]*") + "$", "i"));

const HEARTBEAT_MS = 15000;
const RECONNECT_GRACE_MS = 10000;
const STARTUP_GRACE_MS = 30000; // After a (re)start, time for players to resume before the sweep removes them
const MAX_MESSAGE_BYTES = 64 * 1024;

type Session = {
  userId: string | null;
  topics: Set<Topic>;
  alive: boolean; // Answered the last ping
};

async function main() {
  if (DATABASE_URL.startsWith("file:")) fs.mkdirSync(path.resolve(__dirname, "../data"), { recursive: true });
  const db = await openDb(DATABASE_URL, DATABASE_TOKEN);
  const store = new Store(db);
  await store.init();

  // Every operation runs alone, so one never sees another half done
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };

  const sessions = new Map<WebSocket, Session>();
  const socketOfUser = new Map<string, WebSocket>(); // The user's current connection
  const leaveTimers = new Map<string, NodeJS.Timeout>(); // Users who dropped out, waiting to resume

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const subscribers = (topic: Topic, except?: WebSocket) =>
    [...sessions].filter(([socket, s]) => socket !== except && s.topics.has(topic)).map(([socket]) => socket);

  const sendTopic = async (topic: Topic, sockets: WebSocket[]) => {
    if (sockets.length === 0) return;
    let message: ServerMessage;
    if (topic === "rooms") {
      message = { type: "rooms", rooms: await store.listRooms() };
    } else if (topic.startsWith("room:")) {
      const roomId = topic.slice(5);
      message = { type: "room", roomId, room: await store.getRoom(roomId) };
    } else {
      const roomId = topic.slice(5);
      message = { type: "game", roomId, game: await store.getGame(roomId) };
    }
    sockets.forEach((socket) => send(socket, message));
  };

  /** Sends the changed rooms and games to their subscribers. */
  const broadcast = async (changes: Changes) => {
    if (changes.rooms.size > 0) await sendTopic("rooms", subscribers("rooms"));
    for (const roomId of changes.rooms) await sendTopic(`room:${roomId}`, subscribers(`room:${roomId}`));
    for (const roomId of changes.games) await sendTopic(`game:${roomId}`, subscribers(`game:${roomId}`));
  };

  const bindUser = (socket: WebSocket, session: Session, userId: string) => {
    session.userId = userId;
    const previous = socketOfUser.get(userId);
    socketOfUser.set(userId, socket);
    if (previous && previous !== socket) previous.close(4000, "replaced");
    clearTimeout(leaveTimers.get(userId));
    leaveTimers.delete(userId);
  };

  const handle = async (socket: WebSocket, session: Session, msg: ClientMessage): Promise<unknown> => {
    if (msg.type === "hello") {
      const user = await store.createUser(cleanName(msg.name));
      bindUser(socket, session, user.userId);
      return user;
    }
    if (msg.type === "resume") {
      if (typeof msg.userId !== "string" || !(await store.checkToken(msg.userId, msg.token))) {
        throw new RequestError("notLoggedIn");
      }
      bindUser(socket, session, msg.userId);
      await store.setUserState(msg.userId, "online");
      return { userId: msg.userId, token: msg.token };
    }
    if (msg.type === "subscribe" || msg.type === "unsubscribe") {
      if (!isTopic(msg.topic)) throw new RequestError("badRequest");
      if (msg.type === "unsubscribe") {
        session.topics.delete(msg.topic);
      } else {
        session.topics.add(msg.topic);
        await sendTopic(msg.topic, [socket]); // The current value
      }
      return undefined;
    }

    const userId = session.userId;
    if (!userId) throw new RequestError("notLoggedIn");
    const roomId = "roomId" in msg ? msg.roomId : "";
    if ("roomId" in msg && typeof roomId !== "string") throw new RequestError("badRequest");

    switch (msg.type) {
      case "createRoom": {
        const created = await store.createRoom(userId, cleanName(msg.name));
        await broadcast(created.changes);
        return { roomId: created.roomId };
      }
      case "joinRoom":
        await broadcast(await store.joinRoom(userId, roomId));
        return undefined;
      case "leaveRoom":
        await broadcast(await store.leaveRoom(userId, roomId));
        return undefined;
      case "setStatus":
        await broadcast(await store.setStatus(userId, roomId, msg.status));
        return undefined;
      case "saveGame":
        await store.saveGame(userId, roomId, msg.gameId, msg.state);
        // Not back to the sender: its state may already be ahead of this save
        await sendTopic(`game:${roomId}`, subscribers(`game:${roomId}`, socket));
        return undefined;
      default:
        throw new RequestError("badRequest");
    }
  };

  /** The user's connection is gone for good: out of their room. */
  const dropUser = (userId: string) =>
    serialize(async () => {
      leaveTimers.delete(userId);
      if (socketOfUser.has(userId)) return; // Came back meanwhile
      await broadcast(await store.disconnect(userId));
    }).catch((error) => console.error("Could not remove a disconnected user", error));

  // ==========================================
  // HTTP + WEBSOCKET SERVER
  // ==========================================

  const server = http.createServer((req, res) => serveStatic(req, res));
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (info: { origin: string; req: http.IncomingMessage }) => isAllowedOrigin(info.origin, info.req.headers.host),
  });

  wss.on("connection", (socket) => {
    const session: Session = { userId: null, topics: new Set(), alive: true };
    sessions.set(socket, session);
    socket.on("pong", () => (session.alive = true));

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== "object" || typeof msg.id !== "number") throw new Error();
      } catch {
        socket.close(1003, "bad message");
        return;
      }
      serialize(() => handle(socket, session, msg))
        .then((data) => send(socket, { type: "reply", id: msg.id, ok: true, data }))
        .catch((error) => {
          if (!(error instanceof RequestError)) console.error(`Request ${msg.type} failed`, error);
          send(socket, { type: "reply", id: msg.id, ok: false, error: error instanceof RequestError ? error.code : "badRequest" });
        });
    });

    socket.on("close", () => {
      sessions.delete(socket);
      const userId = session.userId;
      if (!userId || socketOfUser.get(userId) !== socket) return; // Not logged in, or replaced by a newer connection
      socketOfUser.delete(userId);
      serialize(() => store.setUserState(userId, "offline")).catch(() => {});
      leaveTimers.set(userId, setTimeout(() => dropUser(userId), RECONNECT_GRACE_MS));
    });
  });

  // Room players with no connection and no reconnect timer: players who didn't come back
  // after a restart, or who were added by the old instance during a redeploy. Checked only
  // after STARTUP_GRACE_MS, so players have time to resume after this server started.
  const startedAt = Date.now();
  const sweep = () =>
    serialize(async () => {
      if (Date.now() - startedAt < STARTUP_GRACE_MS) return;
      for (const userId of await store.playersInRooms()) {
        if (!socketOfUser.has(userId) && !leaveTimers.has(userId)) await broadcast(await store.disconnect(userId));
      }
    }).catch((error) => console.error("Sweep failed", error));

  // Connections that stopped answering pings are closed (then handled like a closed tab)
  const heartbeat = setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive) {
        socket.terminate();
        continue;
      }
      session.alive = false;
      socket.ping();
    }
    sweep();
  }, HEARTBEAT_MS);

  server.listen(PORT, () => console.log(`Maze game server on http://localhost:${PORT} (database ${DATABASE_URL.startsWith("file:") ? DATABASE_URL : "Turso"})`));

  const shutdown = () => {
    clearInterval(heartbeat);
    wss.clients.forEach((socket) => socket.terminate());
    server.close();
    queue.finally(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (value === "rooms" || /^(room|game):[\w-]{1,64}$/.test(value));
}

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // Not a browser
  try {
    const url = new URL(origin);
    return url.host === host || ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)) ||
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// ==========================================
// STATIC FILES (the built client in dist/)
// ==========================================

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("ok");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(DIST_DIR, "." + pathname);
  // No way out of dist/
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      const message = fs.existsSync(DIST_DIR) ? "Not found" : "dist/ is missing: run `npm run build` first";
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
      return;
    }
    const hashed = pathname.startsWith("/assets/"); // Vite fingerprints these, so they never change
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
