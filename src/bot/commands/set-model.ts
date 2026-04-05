import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getProject, setModel } from "../../db/database.js";
import { L } from "../../utils/i18n.js";

const VALID_MODELS = ["opus", "sonnet", "haiku", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"];

export const data = new SlashCommandBuilder()
  .setName("set-model")
  .setDescription("Set the Claude model for this channel's agent")
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("Model alias (opus, sonnet) or full ID (claude-opus-4-6)")
      .setRequired(true)
      .addChoices(
        { name: "Opus (claude-opus-4-6)", value: "opus" },
        { name: "Sonnet (claude-sonnet-4-6)", value: "sonnet" },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply(
      L("No project registered in this channel. Use /register first.", "이 채널에 등록된 프로젝트가 없습니다. 먼저 /register를 사용하세요."),
    );
    return;
  }

  const model = interaction.options.getString("model", true);

  setModel(channelId, model);
  await interaction.editReply(
    L(`Model set to **${model}** for this channel.`, `이 채널의 모델이 **${model}**로 설정되었습니다.`),
  );
}
