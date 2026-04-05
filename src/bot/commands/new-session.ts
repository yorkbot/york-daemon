import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { getProject, upsertSession } from "../../db/database.js";
import { sessionManager } from "../../claude/session-manager.js";
import { L } from "../../utils/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("new-session")
  .setDescription("Start a fresh conversation (keeps history)");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply(
      L(
        "No project registered in this channel. Use /register first.",
        "이 채널에 등록된 프로젝트가 없습니다.",
      ),
    );
    return;
  }

  // Stop active session if one exists
  await sessionManager.stopSession(channelId);

  // Clear session_id so next message starts fresh
  upsertSession(randomUUID(), channelId, null, "idle");

  await interaction.editReply(
    L(
      "✨ New session started. Your next message begins a fresh conversation.\nPrevious conversation history is preserved.",
      "✨ 새 세션이 시작되었습니다. 다음 메시지부터 새로운 대화가 시작됩니다.\n이전 대화 기록은 유지됩니다.",
    ),
  );
}
