import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { backKeyboard, isGroup, requireAdmin } from "../moderation/helpers.js";
import { now } from "../moderation/clock.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

registerMainMenuItem({ label: "Moderation report", data: "report:show", order: 30 });
const composer = new Composer<Ctx>();
function report(state: Awaited<ReturnType<typeof readGroup>>) {
  const since = now().getTime() - 86_400_000;
  const joins = state.joins.filter((t) => t >= since).length;
  const verified = state.memberIds.filter((id) => state.members[String(id)]?.verified).length;
  const incidents = state.incidents.filter((i) => i.timestamp >= since).length;
  return `Today’s moderation report\nNew members: ${joins}\nVerified members: ${verified}\nSpam incidents: ${incidents}\nManual actions retained: ${state.adminActions.length}`;
}
composer.callbackQuery("report:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat;
  if (!chat || !isGroup(ctx)) return void (await ctx.editMessageText("Add GroupGuard to a group to view its moderation report.", { reply_markup: backKeyboard() }));
  if (!(await requireAdmin(ctx))) return;
  if (!storageReady()) return void (await ctx.editMessageText("Moderation storage isn’t set up yet.", { reply_markup: backKeyboard() }));
  const state = await readGroup(chat.id); await ctx.editMessageText(report(state), { reply_markup: backKeyboard() });
});
// Daily summaries are emitted on the next group activity after a new UTC day.
// This avoids an unreliable process timer while retaining a durable schedule marker.
composer.on("message", async (ctx, next) => {
  if (!isGroup(ctx) || !storageReady()) return next();
  const state = await readGroup(ctx.chat.id); const day = now().toISOString().slice(0, 10);
  if (state.lastDailySummaryDay !== day) { state.lastDailySummaryDay = day; await writeGroup(ctx.chat.id, state); await ctx.reply(report(state)); }
  return next();
});
export default composer;
