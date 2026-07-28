import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../moderation/clock.js";
import { addOrUpdateMember, compactEvidence, isAdmin, isGroup } from "../moderation/helpers.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

const composer = new Composer<Ctx>();
const limits = { low: 10, normal: 6, high: 3 } as const;
const link = /(?:https?:\/\/|www\.)\S+/i;

async function act(ctx: Ctx, action: "warn" | "mute" | "remove", userId: number, evidence: string) {
  if (!ctx.chat) return;
  try {
    if (action === "mute") await ctx.api.restrictChatMember(ctx.chat.id, userId, { can_send_messages: false }, { until_date: Math.floor((now().getTime() + 3_600_000) / 1000) });
    if (action === "remove") { await ctx.api.banChatMember(ctx.chat.id, userId); await ctx.api.unbanChatMember(ctx.chat.id, userId); }
    await ctx.reply(action === "warn" ? "A spam warning was recorded for a member." : action === "mute" ? "A suspected spammer was muted for one hour." : "A suspected spammer was removed.");
    return true;
  } catch {
    await ctx.reply("I spotted suspected spam but couldn’t apply the action. Check my group permissions.");
    return false;
  }
}

composer.on("message:text", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.from || !ctx.message || ctx.message.pinned_message) return next();
  if (!storageReady()) return next();
  if (await isAdmin(ctx)) return next();
  const state = await readGroup(ctx.chat.id); const member = addOrUpdateMember(state, { id: ctx.from.id, username: ctx.from.username });
  const time = now().getTime(); const text = compactEvidence(ctx.message.text).toLowerCase();
  // A timer cannot be relied on in a Worker isolate, so every group activity
  // also sweeps the durable verification deadlines. The deadline itself uses
  // the injectable clock, making expiry deterministic in tests.
  for (const id of state.memberIds) {
    const pending = state.members[String(id)];
    if (!pending?.verified && pending.verificationDeadline && pending.verificationDeadline <= time) {
      try {
        await ctx.api.banChatMember(ctx.chat.id, pending.userId);
        await ctx.api.unbanChatMember(ctx.chat.id, pending.userId);
        pending.verificationDeadline = undefined;
        state.incidents.push({ timestamp: time, actionType: "remove", evidence: "verification timeout", userId: pending.userId });
        await ctx.reply("An unverified member was removed after the verification timeout.");
      } catch {
        // Keep the deadline so a later activity retries after permissions recover.
      }
    }
  }
  member.messageTimes = member.messageTimes.filter((at) => at >= time - 60_000); member.messageTimes.push(time);
  const duplicate = text.length >= 8 && state.recentMessages.some((m) => m.userId !== member.userId && m.text === text && m.at >= time - 10 * 60_000);
  const tooFast = member.messageTimes.length >= limits[state.settings.sensitivity];
  // Telegram does not expose account creation dates. An unverified link post is
  // therefore treated as review-worthy, never as a fabricated "account age".
  const suspiciousLink = !member.verified && link.test(text);
  state.recentMessages = state.recentMessages.filter((m) => m.at >= time - 10 * 60_000); state.recentMessages.push({ text, at: time, userId: member.userId });
  if (duplicate || tooFast || suspiciousLink) {
    const evidence = duplicate ? "duplicate message" : tooFast ? "message rate exceeded" : "link from an unverified member";
    const applied = await act(ctx, state.settings.escalation, member.userId, evidence);
    if (applied) state.incidents.push({ timestamp: time, actionType: state.settings.escalation === "remove" ? "remove" : state.settings.escalation, evidence, userId: member.userId });
  }
  await writeGroup(ctx.chat.id, state);
  return next();
});
export default composer;
