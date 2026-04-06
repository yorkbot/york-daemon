import http from "node:http";
import type { Client, TextChannel } from "discord.js";
import { getProjectByAgentName } from "../db/database.js";
import { sessionManager } from "../claude/session-manager.js";

const API_PORT = 3002;
const API_HOST = "127.0.0.1";

let server: http.Server | null = null;
let discordClient: Client | null = null;

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  data: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleAsk(
  body: Record<string, unknown>,
  res: http.ServerResponse,
): Promise<void> {
  const agent = body.agent as string | undefined;
  const prompt = body.prompt as string | undefined;
  const timeout = (body.timeout as number | undefined) ?? 120;

  if (!agent || !prompt) {
    jsonResponse(res, 400, { ok: false, error: "Missing required fields: agent, prompt" });
    return;
  }

  const project = getProjectByAgentName(agent);
  if (!project) {
    jsonResponse(res, 404, { ok: false, error: `Agent "${agent}" not found` });
    return;
  }

  if (sessionManager.isActive(project.channel_id)) {
    jsonResponse(res, 409, { ok: false, error: `Agent "${agent}" has an active session` });
    return;
  }

  try {
    console.log(`[api] /ask: Sending prompt to ${agent} (timeout: ${timeout}s)`);
    const result = await sessionManager.sendMessageHeadless(
      project.channel_id,
      prompt,
      timeout,
      body.model as string | undefined,
    );
    jsonResponse(res, 200, { ok: true, response: result.response, duration_ms: result.durationMs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[api] /ask error for ${agent}:`, msg);
    jsonResponse(res, 500, { ok: false, error: msg });
  }
}

async function handleTell(
  body: Record<string, unknown>,
  res: http.ServerResponse,
): Promise<void> {
  const agent = body.agent as string | undefined;
  const prompt = body.prompt as string | undefined;

  if (!agent || !prompt) {
    jsonResponse(res, 400, { ok: false, error: "Missing required fields: agent, prompt" });
    return;
  }

  const project = getProjectByAgentName(agent);
  if (!project) {
    jsonResponse(res, 404, { ok: false, error: `Agent "${agent}" not found` });
    return;
  }

  if (!discordClient) {
    jsonResponse(res, 503, { ok: false, error: "Discord client not available" });
    return;
  }

  try {
    const channel = await discordClient.channels.fetch(project.channel_id) as TextChannel;
    if (!channel) {
      jsonResponse(res, 404, { ok: false, error: `Discord channel not found for agent "${agent}"` });
      return;
    }

    console.log(`[api] /tell: Fire-and-forget to ${agent}`);
    // Fire and forget — sendMessage handles Discord streaming
    sessionManager.sendMessage(channel, prompt, body.model as string | undefined).catch((err) => {
      console.error(`[api] /tell background error for ${agent}:`, err);
    });

    jsonResponse(res, 202, { ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[api] /tell error for ${agent}:`, msg);
    jsonResponse(res, 500, { ok: false, error: msg });
  }
}

async function handleStatus(
  body: Record<string, unknown>,
  res: http.ServerResponse,
): Promise<void> {
  const agent = body.agent as string | undefined;

  if (!agent) {
    jsonResponse(res, 400, { ok: false, error: "Missing required field: agent" });
    return;
  }

  const project = getProjectByAgentName(agent);
  if (!project) {
    jsonResponse(res, 404, { ok: false, error: `Agent "${agent}" not found` });
    return;
  }

  jsonResponse(res, 200, {
    ok: true,
    agent,
    active: sessionManager.isActive(project.channel_id),
    queue_size: sessionManager.getQueueSize(project.channel_id),
  });
}

export function startApiServer(client: Client): Promise<http.Server> {
  discordClient = client;

  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      // Only POST allowed
      if (req.method !== "POST") {
        jsonResponse(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      try {
        const body = await parseBody(req);

        switch (req.url) {
          case "/api/agent/ask":
            await handleAsk(body, res);
            break;
          case "/api/agent/tell":
            await handleTell(body, res);
            break;
          case "/api/agent/status":
            await handleStatus(body, res);
            break;
          default:
            jsonResponse(res, 404, { ok: false, error: "Not found" });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        jsonResponse(res, 400, { ok: false, error: msg });
      }
    });

    server.listen(API_PORT, API_HOST, () => {
      console.log(`[api] Listening on ${API_HOST}:${API_PORT}`);
      resolve(server!);
    });

    server.on("error", reject);
  });
}

export function stopApiServer(): void {
  if (server) {
    server.close();
    server = null;
  }
  discordClient = null;
}
