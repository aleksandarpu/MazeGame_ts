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

export async function openDb(url: string, authToken?: string): Promise<Db> {
  const client: Client = createClient({ url, authToken });
  await client.executeMultiple(schema);

  // The open transaction, if any. The server runs one operation at a time
  // (serialize in index.ts), so there is never more than one.
  let tx: Transaction | null = null;

  const execute = async (sql: string, params: unknown[] = []) => {
    const statement = { sql, args: params } as InStatement;
    const result = await (tx ?? client).execute(statement);
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
      if (tx) return work(); // Already inside one
      tx = await client.transaction("write");
      try {
        const result = await work();
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      } finally {
        tx.close();
        tx = null;
      }
    },
    close: () => client.close(),
  };
}
