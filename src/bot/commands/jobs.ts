import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getScheduledJobs,
  deleteScheduledJob,
  toggleScheduledJob,
} from "../../db/database.js";
import { L } from "../../utils/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("jobs")
  .setDescription("Manage scheduled jobs for this channel")
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List scheduled jobs"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a scheduled job")
      .addIntegerOption((option) =>
        option.setName("id").setDescription("Job ID").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("toggle")
      .setDescription("Enable or disable a scheduled job")
      .addIntegerOption((option) =>
        option.setName("id").setDescription("Job ID").setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  if (subcommand === "list") {
    const jobs = getScheduledJobs(channelId);
    if (jobs.length === 0) {
      await interaction.editReply(
        L("No scheduled jobs for this channel.", "이 채널에 예약된 작업이 없습니다."),
      );
      return;
    }

    const lines = jobs.map((j) => {
      const status = j.enabled ? "✅" : "⏸️";
      const model = j.model_override ? ` [${j.model_override}]` : "";
      const lastRun = j.last_run ? ` (last: ${j.last_run})` : "";
      const prompt = j.prompt.length > 60 ? j.prompt.slice(0, 60) + "…" : j.prompt;
      return `${status} **#${j.id}** \`${j.cron_expression}\`${model} — ${prompt}${lastRun}`;
    });

    await interaction.editReply(lines.join("\n"));
  } else if (subcommand === "delete") {
    const id = interaction.options.getInteger("id", true);
    const deleted = deleteScheduledJob(id);
    await interaction.editReply(
      deleted
        ? L(`Job **#${id}** deleted.`, `작업 **#${id}** 삭제됨.`)
        : L(`Job **#${id}** not found.`, `작업 **#${id}**를 찾을 수 없습니다.`),
    );
  } else if (subcommand === "toggle") {
    const id = interaction.options.getInteger("id", true);
    const jobs = getScheduledJobs(channelId);
    const job = jobs.find((j) => j.id === id);
    if (!job) {
      await interaction.editReply(L(`Job **#${id}** not found.`, `작업 **#${id}**를 찾을 수 없습니다.`));
      return;
    }
    const newEnabled = !job.enabled;
    toggleScheduledJob(id, newEnabled);
    await interaction.editReply(
      L(
        `Job **#${id}** ${newEnabled ? "enabled ✅" : "disabled ⏸️"}.`,
        `작업 **#${id}** ${newEnabled ? "활성화 ✅" : "비활성화 ⏸️"}.`,
      ),
    );
  }
}
