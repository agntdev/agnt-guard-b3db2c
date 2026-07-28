import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../moderation/clock.js";
import { isAdmin, isGroup, requireAdmin, targetFromCommand } from "../moderation/helpers.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

const composer = new Composer<Ctx>();
function duration(input: string): number | undefined {
  const m = /^(\d+)(m|h|d)$/i.exec(input); if (!m) return undefined;
  const n = Number(m[1]); const unit = m[2].toLowerCase(); const ms = n * (unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000);
  return n >= 1 && ms <= 30 * 86_400_000 ? ms : undefined;
}
composer.command("mute", async (ctx) => {
  if (!isGroup(ctx)) return void (await ctx.reply("This control is available to group admins only."));
  if (!(await requireAdmin(ctx))) return;
  if (!storageReady()) return void (await ctx.reply("Moderation storage isn’t set up yet. Try again after it’s connected."));
  const [targetName, span, ...reasonParts] = (ctx.match ?? "").trim().split(/\s+/); const ms = duration(span ?? "");
  const state = await readGroup(ctx.chat.id); const target = targetFromCommand(ctx, state, targetName ?? ""); const reason = reasonParts.join(" ").trim() || "No reason provided";
  if (!target || !ms) return void (await ctx.reply("Reply to a member with /mute, a duration like 30m, and a reason."));
  if (target.userId === ctx.from?.id || await isAdmin(ctx, target.userId)) return void (await ctx.reply("Admins can’t be muted by this bot."));
  const until = Math.floor((now().getTime() + ms) / 1000);
  try { await ctx.api.restrictChatMember(ctx.chat.id, target.userId, { can_send_messages: false }, { until_date: until }); }
  catch { return void (await ctx.reply("I couldn’t mute that member. Check that I can restrict members.")); }
  state.adminActions.push({ timestamp: now().getTime(), actionType: "mute", reason: reason.slice(0, 500), adminId: ctx.from!.id, userId: target.userId });
  await writeGroup(ctx.chat.id, state); await ctx.reply(`Member muted for ${span}. Reason: ${reason.slice(0, 500)}`);
});
export default composer;
