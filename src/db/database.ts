import Database from "better-sqlite3";
import path from "node:path";
import type { Project, ScheduledJob, Session, SessionStatus } from "./types.js";

const DB_PATH = path.join(process.cwd(), "data.db");

let db: Database.Database;

export function initDatabase(): void {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      channel_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      auto_approve INTEGER DEFAULT 0,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES projects(channel_id) ON DELETE CASCADE,
      session_id TEXT,
      status TEXT DEFAULT 'offline',
      last_activity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL REFERENCES projects(channel_id) ON DELETE CASCADE,
      cron_expression TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      model_override TEXT,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add model column to existing projects table
  try {
    db.exec("ALTER TABLE projects ADD COLUMN model TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add one_shot column to scheduled_jobs
  try {
    db.exec("ALTER TABLE scheduled_jobs ADD COLUMN one_shot INTEGER DEFAULT 0");
  } catch {
    // Column already exists
  }
}

export function getDb(): Database.Database {
  return db;
}

// Project queries
export function registerProject(
  channelId: string,
  projectPath: string,
  guildId: string,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO projects (channel_id, project_path, guild_id)
    VALUES (?, ?, ?)
  `);
  stmt.run(channelId, projectPath, guildId);
}

export function unregisterProject(channelId: string): void {
  db.prepare("DELETE FROM sessions WHERE channel_id = ?").run(channelId);
  db.prepare("DELETE FROM projects WHERE channel_id = ?").run(channelId);
}

export function getProject(channelId: string): Project | undefined {
  return db
    .prepare("SELECT * FROM projects WHERE channel_id = ?")
    .get(channelId) as Project | undefined;
}

export function getAllProjects(guildId: string): Project[] {
  return db
    .prepare("SELECT * FROM projects WHERE guild_id = ?")
    .all(guildId) as Project[];
}

export function setAutoApprove(
  channelId: string,
  autoApprove: boolean,
): void {
  db.prepare("UPDATE projects SET auto_approve = ? WHERE channel_id = ?").run(
    autoApprove ? 1 : 0,
    channelId,
  );
}

// Session queries
export function upsertSession(
  id: string,
  channelId: string,
  sessionId: string | null,
  status: SessionStatus,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, channel_id, session_id, status, last_activity)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(id, channelId, sessionId, status);
}

export function getSession(channelId: string): Session | undefined {
  return db
    .prepare(
      "SELECT * FROM sessions WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(channelId) as Session | undefined;
}

export function updateSessionStatus(
  channelId: string,
  status: SessionStatus,
): void {
  db.prepare(
    "UPDATE sessions SET status = ?, last_activity = datetime('now') WHERE channel_id = ?",
  ).run(status, channelId);
}

export function getAllSessions(guildId: string): (Session & { project_path: string })[] {
  return db
    .prepare(`
      SELECT s.*, p.project_path FROM sessions s
      JOIN projects p ON s.channel_id = p.channel_id
      WHERE p.guild_id = ?
    `)
    .all(guildId) as (Session & { project_path: string })[];
}

// Model queries
export function setModel(channelId: string, model: string | null): void {
  db.prepare("UPDATE projects SET model = ? WHERE channel_id = ?").run(model, channelId);
}

export function getModel(channelId: string): string | null {
  const row = db.prepare("SELECT model FROM projects WHERE channel_id = ?").get(channelId) as { model: string | null } | undefined;
  return row?.model ?? null;
}

// Scheduled job queries
export function createScheduledJob(
  channelId: string,
  cronExpression: string,
  prompt: string,
  modelOverride?: string,
  oneShot?: boolean,
): ScheduledJob {
  const stmt = db.prepare(`
    INSERT INTO scheduled_jobs (channel_id, cron_expression, prompt, model_override, one_shot)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(channelId, cronExpression, prompt, modelOverride ?? null, oneShot ? 1 : 0);
  return db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(result.lastInsertRowid) as ScheduledJob;
}

export function deleteScheduledJob(id: number): boolean {
  const result = db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getScheduledJobs(channelId?: string): ScheduledJob[] {
  if (channelId) {
    return db.prepare("SELECT * FROM scheduled_jobs WHERE channel_id = ? ORDER BY id").all(channelId) as ScheduledJob[];
  }
  return db.prepare("SELECT * FROM scheduled_jobs ORDER BY id").all() as ScheduledJob[];
}

export function getAllEnabledJobs(): (ScheduledJob & { project_path: string })[] {
  return db.prepare(`
    SELECT j.*, p.project_path FROM scheduled_jobs j
    JOIN projects p ON j.channel_id = p.channel_id
    WHERE j.enabled = 1
  `).all() as (ScheduledJob & { project_path: string })[];
}

export function updateJobLastRun(id: number): void {
  db.prepare("UPDATE scheduled_jobs SET last_run = datetime('now') WHERE id = ?").run(id);
}

export function toggleScheduledJob(id: number, enabled: boolean): boolean {
  const result = db.prepare("UPDATE scheduled_jobs SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  return result.changes > 0;
}
