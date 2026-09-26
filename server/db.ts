import sqlite3 from "sqlite3";

// Thin promise wrapper around the sqlite3 package, plus the schema.
//
//   rooms        (id, name, status, host_id, is_mock, game_id, created_at)
//   room_players (room_id, user_id, name, status, joined_at, is_mock)
//   games        (room_id, game_id, width, maze, state)   state = SyncedGameState as JSON
//   users        (id, name, token, state, room_id, last_changed)   presence, replaces RTDB status/{userId}

export type Db = {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs `work` inside BEGIN / COMMIT, rolling back if it throws. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

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
    room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL,
    name      TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'waiting',
    joined_at INTEGER NOT NULL,
    is_mock   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS games (
    room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
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

export async function openDb(file: string): Promise<Db> {
  const raw = await new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(file, (error) => (error ? reject(error) : resolve(db)));
  });

  const db: Db = {
    run: (sql, params = []) =>
      new Promise((resolve, reject) => raw.run(sql, params, (error) => (error ? reject(error) : resolve()))),
    get: <T>(sql: string, params: unknown[] = []) =>
      new Promise<T | undefined>((resolve, reject) =>
        raw.get(sql, params, (error, row) => (error ? reject(error) : resolve(row as T | undefined)))),
    all: <T>(sql: string, params: unknown[] = []) =>
      new Promise<T[]>((resolve, reject) =>
        raw.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows as T[])))),
    async transaction(work) {
      await db.run("BEGIN IMMEDIATE");
      try {
        const result = await work();
        await db.run("COMMIT");
        return result;
      } catch (error) {
        await db.run("ROLLBACK");
        throw error;
      }
    },
    close: () => new Promise((resolve, reject) => raw.close((error) => (error ? reject(error) : resolve()))),
  };

  await new Promise<void>((resolve, reject) => raw.exec(schema, (error) => (error ? reject(error) : resolve())));
  return db;
}
