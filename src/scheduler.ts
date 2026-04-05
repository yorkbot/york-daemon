import type { Client, TextChannel } from "discord.js";
import { getAllEnabledJobs, updateJobLastRun } from "./db/database.js";
import { sessionManager } from "./claude/session-manager.js";

/**
 * Simple cron scheduler that checks every 60 seconds for jobs that should run.
 * Uses minute-level granularity matching against cron expressions.
 */

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let discordClient: Client | null = null;

export function startScheduler(client: Client): void {
  discordClient = client;

  // Check every 60 seconds
  schedulerInterval = setInterval(() => {
    checkJobs().catch((err) => {
      console.error("[scheduler] Error checking jobs:", err);
    });
  }, 60_000);

  console.log("[scheduler] Started (checking every 60s)");
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  console.log("[scheduler] Stopped");
}

async function checkJobs(): Promise<void> {
  if (!discordClient) return;

  const now = new Date();
  const jobs = getAllEnabledJobs();

  for (const job of jobs) {
    if (!matchesCron(job.cron_expression, now)) continue;

    // Add jitter (0-30s) to avoid burst
    const jitter = Math.floor(Math.random() * 30_000);

    setTimeout(async () => {
      try {
        const channel = await discordClient!.channels.fetch(job.channel_id);
        if (!channel || !channel.isTextBased()) {
          console.warn(`[scheduler] Channel ${job.channel_id} not found for job #${job.id}`);
          return;
        }

        // Don't run if session is already active
        if (sessionManager.isActive(job.channel_id)) {
          console.log(`[scheduler] Skipping job #${job.id} — session already active in channel`);
          return;
        }

        console.log(`[scheduler] Running job #${job.id}: ${job.prompt.slice(0, 50)}...`);
        updateJobLastRun(job.id);

        await (channel as TextChannel).send(`⏰ **Scheduled job #${job.id}** running...`);
        await sessionManager.sendMessage(
          channel as TextChannel,
          job.prompt,
          job.model_override ?? undefined,
        );
      } catch (err) {
        console.error(`[scheduler] Failed to run job #${job.id}:`, err);
      }
    }, jitter);
  }
}

/**
 * Match a cron expression against a date.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Supports: *, specific values, ranges (1-5), lists (1,3,5), steps (star/5)
 */
function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-indexed
  const dayOfWeek = date.getDay(); // 0=Sunday

  return (
    matchField(minExpr, minute, 0, 59) &&
    matchField(hourExpr, hour, 0, 23) &&
    matchField(domExpr, dayOfMonth, 1, 31) &&
    matchField(monExpr, month, 1, 12) &&
    matchField(dowExpr, dayOfWeek, 0, 7) // 0 and 7 are both Sunday
  );
}

function matchField(expr: string, value: number, min: number, max: number): boolean {
  // Handle day-of-week Sunday normalization (7 -> 0)
  if (max === 7 && value === 7) value = 0;

  for (const part of expr.split(",")) {
    if (matchPart(part.trim(), value, min, max)) return true;
  }
  return false;
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  // Wildcard
  if (part === "*") return true;

  // Step: */N or range/N
  const stepMatch = part.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[2], 10);
    const base = stepMatch[1];
    if (base === "*") {
      return value % step === 0;
    }
    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      return value >= start && value <= end && (value - start) % step === 0;
    }
    return false;
  }

  // Range: N-M
  const rangeMatch = part.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return value >= start && value <= end;
  }

  // Exact value
  const num = parseInt(part, 10);
  if (!isNaN(num)) {
    // Normalize Sunday (0 and 7 both match)
    if (max === 7 && num === 7) return value === 0;
    return value === num;
  }

  return false;
}
