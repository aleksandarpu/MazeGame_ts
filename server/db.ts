import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, Client, InStatement, Transaction } from "@libsql/client";

// Thin wrapper around the libSQL client, plus the schema. In production the database
// is on Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN); without them it's a local
// SQLite file, so development needs no account.
//
//   rooms        (id, name, status, host_id, is_mock, game_id, created_at)
//   room_players (room_id, user_id, name, status, joined_at, is_mock)
//   games        (room_id, game_id, width, maze, state)   state = SyncedGameState as JSON
//   users        (id, name, token, state, room_id, last_changed)   presence
//
// Deletes remove the child rows explicitly (store.ts) instead of relying on
// ON DELETE CASCADE, because foreign keys aren't enforced on every connection.

export type Db = {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs `work` in a write transaction; run / get / all inside it use the transaction. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): void;
};

const schema = `
  CREATE TABLE IF NOT EXISTS rooms (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'waiting',
    host_id    TEXT NOT NULL DEFAULT '',
    is_mock    INTEGER NOT NULL DEFAULT 0,
    game_id    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_players (
    room_id   TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    name      TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'waiting',
    joined_at INTEGER NOT NULL,
    is_mock   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS games (
    room_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    width   INTEGER NOT NULL,
    maze    TEXT NOT NULL,
    state   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token        TEXT NOT NULL,
    state        TEXT NOT NULL DEFAULT 'online',
    room_id      TEXT,
    last_changed INTEGER NOT NULL
  );
`;

// A database call that doesn't answer in time has failed. Without a limit, one stuck call would
// hold up every request behind it, since the server runs them one at a time (serialize in index.ts).
const CALL_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS ?? 10000);

/** The transaction a call belongs to: its connection, and whether it was given up after a timeout. */
type TxContext = { tx: Transaction; owner: Client; abandoned: boolean };
// Carried along the transaction's own async chain, so work left behind by a timeout can't run on
// the next connection
const txContext = new AsyncLocalStorage<TxContext>();

/** Rejects if the promise hasn't settled within CALL_TIMEOUT_MS; then `onTimeout` runs. */
function withDeadline<T>(promise: Promise<T>, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`database did not answer within ${CALL_TIMEOUT_MS} ms`));
    }, CALL_TIMEOUT_MS);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export async function openDb(url: string, authToken?: string): Promise<Db> {
  let client: Client = createClient({ url, authToken });
  // A connection that stopped answering is dropped (its waiting calls fail) and replaced.
  // Only the first report for a connection counts: later ones are about the old connection.
  const replace = (broken: Client) => () => {
    if (client !== broken) return;
    try {
      broken.close();
    } catch {}
    client = createClient({ url, authToken });
  };
  await withDeadline(client.executeMultiple(schema), replace(client));

  const execute = async (sql: string, params: unknown[] = []) => {
    const ctx = txContext.getStore();
    if (ctx?.abandoned) throw new Error("transaction given up after a timeout");
    const statement = { sql, args: params } as InStatement;
    const connection = ctx ? ctx.tx : client;
    const result = await withDeadline(connection.execute(statement), () => {
      if (ctx) ctx.abandoned = true;
      replace(ctx ? ctx.owner : client)();
    });
    // Plain objects keyed by column name
    return result.rows.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])));
  };

  return {
    run: async (sql, params) => {
      await execute(sql, params);
    },
    get: async <T>(sql: string, params?: unknown[]) => (await execute(sql, params))[0] as T | undefined,
    all: async <T>(sql: string, params?: unknown[]) => (await execute(sql, params)) as T[],
    async transaction(work) {
      if (txContext.getStore()) return work(); // Already inside one
      const owner = client;
      const tx = await withDeadline(owner.transaction("write"), replace(owner));
      const ctx: TxContext = { tx, owner, abandoned: false };
      return txContext.run(ctx, async () => {
        try {
          const result = await work();
          await withDeadline(tx.commit(), () => {
            ctx.abandoned = true;
            replace(owner)();
          });
          return result;
        } catch (error) {
          await withDeadline(tx.rollback(), replace(owner)).catch(() => {});
          throw error;
        } finally {
          try {
            tx.close();
          } catch {}
        }
      });
    },
    close: () => client.close(),
  };
}
