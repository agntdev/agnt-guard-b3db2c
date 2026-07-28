import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../moderation/clock.js";
import { addOrUpdateMember, isGroup, verificationKeyboard } from "../moderation/helpers.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

const composer = new Composer<Ctx>();

// Telegram delivers this when the bot is an administrator with chat-member updates enabled.
composer.on("chat_member", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.chatMember) return next();
  const update = ctx.chatMember;
  const joined = ["member", "restricted"].includes(update.new_chat_member.status) &&
    ["left", "kicked"].includes(update.old_chat_member.status);
  if (!joined || update.new_chat_member.user.is_bot) return;
  if (!storageReady()) {
    await ctx.reply("Moderation storage isn’t set up yet, so new-member verification is paused.");
    return;
  }
  const state = await readGroup(ctx.chat.id);
  const member = addOrUpdateMember(state, { id: update.new_chat_member.user.id, username: update.new_chat_member.user.username, joined: true });
  member.verified = false;
  member.verificationDeadline = now().getTime() + state.settings.verificationTimeoutMinutes * 60_000;
  await writeGroup(ctx.chat.id, state);
  try {
    await ctx.api.restrictChatMember(ctx.chat.id, member.userId, { can_send_messages: false });
  } catch {
    await ctx.reply("I need permission to restrict new members before verification can run.");
    return;
  }
  await ctx.reply(`${state.settings.welcome}\n${state.settings.rules}`, { reply_markup: verificationKeyboard() });
});

composer.callbackQuery("verify:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat;
  if (!chat || !isGroup(ctx) || !ctx.from) return void (await ctx.reply("Open this button in the group you joined."));
  if (!storageReady()) return void (await ctx.reply("Verification is temporarily unavailable. Ask an admin to check moderation storage."));
  const state = await readGroup(chat.id);
  const member = state.members[String(ctx.from.id)];
  if (!member) return void (await ctx.reply("Your verification request has expired. Ask an admin to let you back in."));
  if (member.verified) return void (await ctx.reply("You’re already verified."));
  if (member.verificationDeadline && now().getTime() > member.verificationDeadline) {
    await ctx.api.banChatMember(chat.id, member.userId);
    await ctx.api.unbanChatMember(chat.id, member.userId);
    member.verificationDeadline = undefined;
    await writeGroup(chat.id, state);
    await ctx.reply("Your verification window expired, so you’ve been removed. Ask an admin for a new invite.");
    return;
  }
  try {
    await ctx.api.restrictChatMember(chat.id, member.userId, {
      can_send_messages: true, can_send_audios: true, can_send_documents: true,
      can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
      can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
      can_add_web_page_previews: true, can_change_info: false, can_invite_users: true,
      can_pin_messages: false, can_manage_topics: false,
    });
  } catch {
    await ctx.reply("I couldn’t restore your posting permission. Ask a group admin to check my permissions.");
    return;
  }
  member.verified = true; member.trusted = true; member.verificationDeadline = undefined;
  await writeGroup(chat.id, state);
  await ctx.reply("You’re verified and can post now.");
});

export default composer;
