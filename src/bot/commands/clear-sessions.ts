import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getProject, upsertSession } from "../../db/database.js";
import { findSessionDir } from "./sessions.js";
import { sessionManager } from "../../claude/session-manager.js";
import { L } from "../../utils/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("clear-sessions")
  .setDescription("Archive all session files and start fresh (preserves history)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: L(
        "This channel is not registered to any project. Use `/register` first.",
        "이 채널에 등록된 프로젝트가 없습니다. 먼저 `/register`를 사용하세요.",
      ),
    });
    return;
  }

  const sessionDir = findSessionDir(project.project_path);
  if (!sessionDir) {
    await interaction.editReply({
      content: L(
        `No session directory found for \`${project.project_path}\``,
        `\`${project.project_path}\`에 대한 세션 디렉토리를 찾을 수 없습니다`,
      ),
    });
    return;
  }

  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    await interaction.editReply({
      content: L("No session files to archive.", "보관할 세션 파일이 없습니다."),
    });
    return;
  }

  // Stop active session
  await sessionManager.stopSession(channelId);

  // Move files to archive subdirectory instead of deleting
  const archiveDir = path.join(sessionDir, "archive");
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  let archived = 0;
  for (const file of files) {
    try {
      fs.renameSync(
        path.join(sessionDir, file),
        path.join(archiveDir, file),
      );
      archived++;
    } catch {
      // skip files that can't be moved
    }
  }

  // Clear session_id so next message starts fresh
  upsertSession(randomUUID(), channelId, null, "idle");

  await interaction.editReply({
    embeds: [
      {
        title: L("Sessions Archived", "세션 보관됨"),
        description: [
          `Project: \`${project.project_path}\``,
          L(
            `Archived **${archived}** session file(s) to \`archive/\``,
            `**${archived}**개의 세션 파일이 \`archive/\`로 보관되었습니다`,
          ),
          L(
            "Your next message will start a fresh conversation.",
            "다음 메시지부터 새로운 대화가 시작됩니다.",
          ),
        ].join("\n"),
        color: 0x7c3aed,
      },
    ],
  });
}
