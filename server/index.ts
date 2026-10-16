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
// before they are removed from their room. Presence is also kept in the database
// (a lease, see sweep), so the old and the new server can overlap during a redeploy.
// It also serves the built client from dist/ if there is one (local testing; in
// production the client is on Vercel), and GET /health for Railway's health check.
// The operation queue and the connections live in memory, so one instance serves the
// players at a time; a second one may start during a redeploy (see PRESENCE_LEASE_MS).

// In production (NODE_ENV=production, or Railway's own variable) the server refuses to start
// without its database and its origins. A missing Turso URL would quietly use a local file that
// is lost on the next redeploy; a missing origin list would lock out the Vercel client.
const IN_PRODUCTION = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const missingConfig = IN_PRODUCTION ? ["TURSO_DATABASE_URL", "ALLOWED_ORIGINS"].filter((name) => !process.env[name]) : [];
if (missingConfig.length > 0) {
  console.error(`Refusing to start in production without: ${missingConfig.join(", ")}`);
  process.exit(1);
}

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

const PING_MS = 5000; // Every connection is pinged this often; one that misses two pings is closed
const RECONNECT_GRACE_MS = 10000; // A dropped player has this long to come back before leaving the room
const PRESENCE_EVERY_PINGS = 3; // Every 3 pings (15 s): refresh this server's users' presence, then sweep
const PRESENCE_LEASE_MS = 45000; // A room player nobody has refreshed for this long has left
const PRUNE_EVERY_MS = 60 * 60 * 1000; // How often the users nobody needs any more are deleted
const USER_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // Offline, in no room, and idle this long: the user is deleted
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

  // The change is already saved: a failure to tell the subscribers must not look like a failed request
  const notify = (changes: Changes) =>
    broadcast(changes).catch((error) => console.error("Could not notify subscribers", error));

  /** The user's connection here is gone: they are offline, and leave their room unless they resume in time. */
  const userLeft = (userId: string) => {
    socketOfUser.delete(userId);
    serialize(() => store.setUserState(userId, "offline")).catch(() => {});
    leaveTimers.set(userId, setTimeout(() => dropUser(userId), RECONNECT_GRACE_MS));
  };

  const bindUser = (socket: WebSocket, session: Session, userId: string) => {
    // This connection logs in as someone else: the user it was for leaves, as if it had closed
    const before = session.userId;
    if (before && before !== userId && socketOfUser.get(before) === socket) userLeft(before);
    // The topics were subscribed as the previous user: the new user subscribes again (the client does
    // this after a resume), so a game they are not in can't keep sending updates to this socket
    if (before !== userId) session.topics.clear();
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
      await store.touchPresence([user.userId]);
      return user;
    }
    if (msg.type === "resume") {
      if (typeof msg.userId !== "string" || !(await store.checkToken(msg.userId, msg.token))) {
        throw new RequestError("notLoggedIn");
      }
      bindUser(socket, session, msg.userId);
      await store.setUserState(msg.userId, "online");
      await store.touchPresence([msg.userId]);
      return { userId: msg.userId, token: msg.token };
    }
    if (msg.type === "subscribe" || msg.type === "unsubscribe") {
      const userId = session.userId;
      if (!userId) throw new RequestError("notLoggedIn");
      if (!isTopic(msg.topic)) throw new RequestError("badRequest");
      if (msg.type === "unsubscribe") {
        session.topics.delete(msg.topic);
      } else {
        // A game is only for the players in its room
        if (msg.topic.startsWith("game:") && !(await store.isInRoom(userId, msg.topic.slice(5)))) {
          throw new RequestError("notAllowed");
        }
        session.topics.add(msg.topic);
        await sendTopic(msg.topic, [socket]); // The current value
      }
      return undefined;
    }

    const userId = session.userId;
    if (!userId) throw new RequestError("notLoggedIn");
    const roomId = "roomId" in msg ? msg.roomId : "";
    if ("roomId" in msg && typeof roomId !== "string") throw new RequestError("badRequest");

    // Changing rooms ends the game subscriptions: the player is no longer in the old room's game
    if (msg.type === "createRoom" || msg.type === "joinRoom" || msg.type === "leaveRoom") {
      for (const topic of session.topics) if (topic.startsWith("game:")) session.topics.delete(topic);
    }

    switch (msg.type) {
      case "createRoom": {
        const created = await store.createRoom(userId, cleanName(msg.name), msg.requestId);
        await notify(created.changes);
        return { roomId: created.roomId };
      }
      case "joinRoom":
        await notify(await store.joinRoom(userId, roomId));
        return undefined;
      case "leaveRoom":
        await notify(await store.leaveRoom(userId, roomId));
        return undefined;
      case "setStatus":
        await notify(await store.setStatus(userId, roomId, msg.status));
        return undefined;
      case "saveGame": {
        const version = await store.saveGame(userId, roomId, msg.gameId, msg.state);
        // Not back to the sender: it gets its version in the reply instead
        await sendTopic(`game:${roomId}`, subscribers(`game:${roomId}`, socket)).catch((error) =>
          console.error("Could not notify subscribers", error)
        );
        return { version };
      }
      case "removePlayers":
        // To everyone, the sender included: the keeper takes the result from here too
        await notify(await store.removeGamePlayers(userId, roomId, msg.gameId, msg.playerIds));
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
          // Anything else is a server problem (e.g. the database), not bad input: the details are in the log
          send(socket, { type: "reply", id: msg.id, ok: false, error: error instanceof RequestError ? error.code : "internal" });
        });
    });

    socket.on("close", () => {
      sessions.delete(socket);
      const userId = session.userId;
      if (!userId || socketOfUser.get(userId) !== socket) return; // Not logged in, or replaced by a newer connection
      userLeft(userId);
    });
  });

  // Room players that nobody is connected to: no connection and no reconnect timer here, and no
  // server has refreshed their presence within the lease. A server still running (e.g. the old one
  // during a redeploy) keeps refreshing its players, so they stay where they are.
  const sweep = () =>
    serialize(async () => {
      for (const userId of await store.staleRoomPlayers(PRESENCE_LEASE_MS)) {
        if (!socketOfUser.has(userId) && !leaveTimers.has(userId)) await broadcast(await store.disconnect(userId));
      }
    }).catch((error) => console.error("Sweep failed", error));

  // Connections that stopped answering pings are closed (then handled like a closed tab)
  let pings = 0;
  let lastPrune = 0;
  const heartbeat = setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive) {
        socket.terminate();
        continue;
      }
      session.alive = false;
      socket.ping();
    }
    if (++pings % PRESENCE_EVERY_PINGS === 0) {
      serialize(() => store.touchPresence([...socketOfUser.keys()])).catch((error) =>
        console.error("Could not refresh presence", error)
      );
      sweep();
      if (Date.now() - lastPrune >= PRUNE_EVERY_MS) {
        lastPrune = Date.now();
        serialize(() => store.pruneUsers(USER_IDLE_MS, PRESENCE_LEASE_MS)).catch((error) =>
          console.error("Could not delete idle users", error)
        );
      }
    }
  }, PING_MS);

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
