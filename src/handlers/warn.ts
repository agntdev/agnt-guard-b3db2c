import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../moderation/clock.js";
import { isAdmin, isGroup, requireAdmin, targetFromCommand } from "../moderation/helpers.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

const composer = new Composer<Ctx>();
composer.command("warn", async (ctx) => {
  if (!isGroup(ctx)) return void (await ctx.reply("This control is available to group admins only."));
  if (!(await requireAdmin(ctx))) return;
  if (!storageReady()) return void (await ctx.reply("Moderation storage isn’t set up yet. Try again after it’s connected."));
  const [targetName, ...reasonParts] = (ctx.match ?? "").trim().split(/\s+/);
  const reason = reasonParts.join(" ").trim(); const state = await readGroup(ctx.chat.id);
  const target = targetFromCommand(ctx, state, targetName ?? "");
  if (!target || !reason) return void (await ctx.reply("Reply to a member with /warn and a reason, or use a username I’ve already seen."));
  if (target.userId === ctx.from?.id || await isAdmin(ctx, target.userId)) return void (await ctx.reply("Admins can’t be warned by this bot."));
  state.adminActions.push({ timestamp: now().getTime(), actionType: "warn", reason: reason.slice(0, 500), adminId: ctx.from!.id, userId: target.userId });
  await writeGroup(ctx.chat.id, state); await ctx.reply(`Warning recorded. Reason: ${reason.slice(0, 500)}`);
});
export default composer;
