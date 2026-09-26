import type { ClientRequest, ErrorCode, ReplyData, ServerMessage, Topic } from "./protocol";

// The one WebSocket between this tab and the game server (server/index.ts).
// - request() sends a request and resolves with the server's reply.
// - subscribe() calls back with a topic's current value and every change after it.
// If the connection drops, it reconnects and resumes as the same user (the server keeps
// the user in their room for a few seconds), then subscribes again. Requests made while
// disconnected are sent after that. If the server no longer knows us, onSessionLost runs.

export class ServerError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

type Pending = { resolve: (data: any) => void; reject: (error: Error) => void };
type Handler = (message: ServerMessage) => void;

const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 4000];

let socket: WebSocket | null = null;
let ready = false; // Connected and logged in (or not logged in yet at all)
let nextId = 1;
let reconnectAttempt = 0;
let session: { userId: string; token: string } | null = null;
let onSessionLost: () => void = () => location.reload();

const pending = new Map<number, Pending>();
const outbox: { id: number; request: ClientRequest }[] = [];
const listeners = new Map<Topic, Set<Handler>>();

/**
 * The game server's WebSocket: VITE_SERVER_URL when set at build time (production:
 * the Railway server, e.g. wss://mazegame.up.railway.app/ws), otherwise /ws on this
 * page's host (development: Vite forwards it to localhost:3000).
 */
function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

function transmit(id: number, request: ClientRequest) {
  socket!.send(JSON.stringify({ ...request, id }));
}

function connect() {
  const ws = new WebSocket(serverUrl());
  socket = ws;
  ready = false;

  ws.onopen = () => {
    reconnectAttempt = 0;
    if (!session) {
      ready = true;
      flush();
      return;
    }
    // Back after a drop: resume first, then resubscribe, then send what waited
    const id = nextId++;
    pending.set(id, {
      resolve: () => {
        ready = true;
        for (const topic of listeners.keys()) transmit(nextId++, { type: "subscribe", topic });
        flush();
      },
      reject: () => onSessionLost(),
    });
    transmit(id, { type: "resume", userId: session.userId, token: session.token });
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === "reply") {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) request?.resolve(message.data);
      else request?.reject(new ServerError(message.error));
      return;
    }
    const topic: Topic = message.type === "rooms" ? "rooms" : `${message.type}:${message.roomId}`;
    listeners.get(topic)?.forEach((handler) => handler(message));
  };

  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    ready = false;
    // Requests that were sent may or may not have been applied; let the callers know
    for (const [id, request] of pending) {
      request.reject(new Error("Connection lost"));
      pending.delete(id);
    }
    if (event.code === 4000) return; // Replaced by a newer connection of the same user
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt++, RECONNECT_DELAYS_MS.length - 1)];
    window.setTimeout(connect, delay);
  };
}

function flush() {
  while (ready && outbox.length > 0) {
    const { id, request } = outbox.shift()!;
    transmit(id, request);
  }
}

/** Sends a request; resolves with the reply's data, rejects with a ServerError. */
export function request<K extends ClientRequest["type"]>(
  req: Extract<ClientRequest, { type: K }>
): Promise<K extends keyof ReplyData ? ReplyData[K] : void> {
  if (!socket) connect();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (ready && socket?.readyState === WebSocket.OPEN) transmit(id, req);
    else outbox.push({ id, request: req });
  });
}

/** Logs in as a new user (every tab is its own player) and returns the user id. */
export async function login(name: string, sessionLost?: () => void): Promise<string> {
  if (sessionLost) onSessionLost = sessionLost;
  const user = await request({ type: "hello", name });
  session = user;
  return user.userId;
}

/** Calls back with every message of the topic, starting with its current value. Returns the unsubscribe. */
export function subscribe(topic: Topic, handler: Handler): () => void {
  let handlers = listeners.get(topic);
  if (!handlers) {
    handlers = new Set();
    listeners.set(topic, handlers);
    request({ type: "subscribe", topic }).catch(() => {}); // Resent after a reconnect anyway
  }
  handlers.add(handler);
  return () => {
    handlers!.delete(handler);
    if (handlers!.size === 0 && listeners.get(topic) === handlers) {
      listeners.delete(topic);
      request({ type: "unsubscribe", topic }).catch(() => {});
    }
  };
}
