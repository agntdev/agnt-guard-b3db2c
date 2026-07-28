import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { backKeyboard, isGroup, requireAdmin, settingsKeyboard } from "../moderation/helpers.js";
import { readGroup, storageReady, writeGroup } from "../moderation/state.js";

registerMainMenuItem({ label: "Moderation settings", data: "settings:show", order: 20 });
const composer = new Composer<Ctx>();

function unavailable() { return "Moderation storage isn’t set up yet. Add the bot’s Redis storage, then try again."; }
function panel(state: Awaited<ReturnType<typeof readGroup>>) {
  const s = state.settings;
  return `Controls are ready.\nVerification timeout: ${s.verificationTimeoutMinutes} minutes\nLink threshold: ${s.linkSuspicionHours} hours\nSpam sensitivity: ${s.sensitivity}\nEscalation: ${s.escalation}`;
}

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat;
  if (!chat || !isGroup(ctx)) return void (await ctx.editMessageText("Add GroupGuard to a group to manage its moderation settings.", { reply_markup: backKeyboard() }));
  if (!(await requireAdmin(ctx))) return;
  if (!storageReady()) return void (await ctx.editMessageText(unavailable(), { reply_markup: backKeyboard() }));
  const state = await readGroup(chat.id);
  await ctx.editMessageText(panel(state), { reply_markup: settingsKeyboard() });
});

composer.callbackQuery(["settings:timeout", "settings:link", "settings:welcome", "settings:rules"], async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat; if (!chat || !isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return;
  const choice = ctx.callbackQuery.data.split(":")[1] as "timeout" | "link" | "welcome" | "rules";
  ctx.session.settingsStep = choice === "link" ? "linkAge" : choice;
  const prompt: Record<typeof choice, string> = {
    timeout: "Send the verification timeout in minutes, from 1 to 60.",
    link: "Send the account-age threshold in hours, from 1 to 720. Telegram cannot reveal a member’s real account age, so this remains a review threshold for link posts.",
    welcome: "Send the welcome message new members should see.",
    rules: "Send the rules text new members should see.",
  };
  await ctx.editMessageText(prompt[choice], { reply_markup: inlineKeyboard([[inlineButton("Cancel", "settings:show")]]) });
});

composer.callbackQuery("settings:sensitivity", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return;
  await ctx.editMessageText("Choose how quickly repeated messages trigger an alert.", { reply_markup: inlineKeyboard([[inlineButton("Low", "settings:sens:low"), inlineButton("Normal", "settings:sens:normal"), inlineButton("High", "settings:sens:high")], [inlineButton("Back", "settings:show")]]) });
});
composer.callbackQuery(/^settings:sens:(low|normal|high)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat; if (!chat || !isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return;
  const state = await readGroup(chat.id); state.settings.sensitivity = ctx.match[1] as typeof state.settings.sensitivity;
  await writeGroup(chat.id, state); await ctx.editMessageText(panel(state), { reply_markup: settingsKeyboard() });
});
composer.callbackQuery("settings:escalation", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat; if (!chat || !isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return;
  await ctx.editMessageText("Choose the automatic response to confirmed spam.", { reply_markup: inlineKeyboard([[inlineButton("Warn", "settings:esc:warn"), inlineButton("Mute", "settings:esc:mute"), inlineButton("Remove", "settings:esc:remove")], [inlineButton("Back", "settings:show")]]) });
});
composer.callbackQuery(/^settings:esc:(warn|mute|remove)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chat = ctx.chat; if (!chat || !isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return;
  const state = await readGroup(chat.id); state.settings.escalation = ctx.match[1] as typeof state.settings.escalation;
  await writeGroup(chat.id, state); await ctx.editMessageText(panel(state), { reply_markup: settingsKeyboard() });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.settingsStep;
  if (!step) return next();
  ctx.session.settingsStep = undefined;
  const chat = ctx.chat; if (!chat || !isGroup(ctx) || !(await requireAdmin(ctx)) || !storageReady()) return void (await ctx.reply(unavailable()));
  const state = await readGroup(chat.id); const value = ctx.message.text.trim();
  if (step === "timeout" || step === "linkAge") {
    const n = Number(value);
    const valid = Number.isInteger(n) && n >= 1 && n <= (step === "timeout" ? 60 : 720);
    if (!valid) return void (await ctx.reply("That value is outside the allowed range. Open settings and try again."));
    if (step === "timeout") state.settings.verificationTimeoutMinutes = n; else state.settings.linkSuspicionHours = n;
  } else {
    if (!value || value.length > 1000) return void (await ctx.reply("Keep that text between 1 and 1,000 characters, then try again."));
    if (step === "welcome") state.settings.welcome = value; else state.settings.rules = value;
  }
  await writeGroup(chat.id, state); await ctx.reply("Saved.", { reply_markup: settingsKeyboard() });
});
export default composer;
