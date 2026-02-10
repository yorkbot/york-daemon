import { Message, TextChannel, Attachment } from "discord.js";
import { getProject } from "../../db/database.js";
import { isAllowedUser, checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../claude/session-manager.js";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

async function downloadAttachment(
  attachment: Attachment,
  projectPath: string,
): Promise<string | null> {
  const ext = path.extname(attachment.name ?? "").toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) return null;

  const uploadDir = path.join(projectPath, ".claude-uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const fileName = `${Date.now()}-${attachment.name}`;
  const filePath = path.join(uploadDir, fileName);

  const response = await fetch(attachment.url);
  if (!response.ok || !response.body) return null;

  const fileStream = fs.createWriteStream(filePath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);

  return filePath;
}

export async function handleMessage(message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if channel is registered
  const project = getProject(message.channelId);
  if (!project) return;

  // Auth check
  if (!isAllowedUser(message.author.id)) {
    await message.reply("You are not authorized to use this bot.");
    return;
  }

  // Rate limit
  if (!checkRateLimit(message.author.id)) {
    await message.reply("Rate limit exceeded. Please wait a moment.");
    return;
  }

  let prompt = message.content.trim();

  // Download image attachments
  const imageAttachments = message.attachments.filter((a) => {
    const ext = path.extname(a.name ?? "").toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  });

  const downloadedPaths: string[] = [];
  for (const [, attachment] of imageAttachments) {
    const filePath = await downloadAttachment(attachment, project.project_path);
    if (filePath) downloadedPaths.push(filePath);
  }

  if (downloadedPaths.length > 0) {
    const fileList = downloadedPaths.map((p) => p).join("\n");
    prompt = `${prompt}\n\n[Attached images - use Read tool to view these files]\n${fileList}`;
  }

  if (!prompt) return;

  const channel = message.channel as TextChannel;

  // Send message to Claude session
  await sessionManager.sendMessage(channel, prompt);
}
