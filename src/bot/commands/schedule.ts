import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getProject, createScheduledJob } from "../../db/database.js";
import { L } from "../../utils/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("Schedule a recurring prompt for this channel's agent")
  .addStringOption((option) =>
    option
      .setName("cron")
      .setDescription("Cron expression (e.g. '30 5 * * *' for 5:30 AM daily)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The prompt to send to the agent")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("Model override for this job (optional)")
      .setRequired(false)
      .addChoices(
        { name: "Opus", value: "opus" },
        { name: "Sonnet", value: "sonnet" },
      ),
  )
  .addBooleanOption((option) =>
    option
      .setName("once")
      .setDescription("Run once then auto-disable (default: false)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply(
      L("No project registered in this channel. Use /register first.", "이 채널에 등록된 프로젝트가 없습니다."),
    );
    return;
  }

  const cron = interaction.options.getString("cron", true);
  const prompt = interaction.options.getString("prompt", true);
  const model = interaction.options.getString("model") ?? undefined;
  const once = interaction.options.getBoolean("once") ?? false;

  // Basic cron validation (5 fields)
  const cronParts = cron.trim().split(/\s+/);
  if (cronParts.length < 5 || cronParts.length > 6) {
    await interaction.editReply(
      L("Invalid cron expression. Use 5-field format: `minute hour day month weekday`", "잘못된 cron 표현식입니다."),
    );
    return;
  }

  const job = createScheduledJob(channelId, cron, prompt, model, once);
  const typeLabel = once ? " (one-shot)" : "";
  await interaction.editReply(
    L(
      `Scheduled job **#${job.id}**${typeLabel} created.\n` +
      `**Cron:** \`${cron}\`\n` +
      `**Prompt:** ${prompt.length > 100 ? prompt.slice(0, 100) + "…" : prompt}\n` +
      (model ? `**Model:** ${model}` : ""),
      `예약 작업 **#${job.id}**${typeLabel} 생성됨.`,
    ),
  );
}
