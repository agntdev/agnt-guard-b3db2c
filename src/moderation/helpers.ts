import type { ChatMember } from "grammy/types";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "./clock.js";
import type { GroupState, Member } from "./state.js";

export function isGroup(ctx: Ctx): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

export async function isAdmin(ctx: Ctx, userId = ctx.from?.id): Promise<boolean> {
  if (!ctx.chat || !userId || !isGroup(ctx)) return false;
  try {
    const member = (await ctx.api.getChatMember(ctx.chat.id, userId)) as ChatMember;
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

export async function requireAdmin(ctx: Ctx): Promise<boolean> {
  if (!(await isAdmin(ctx))) {
    await ctx.reply("This control is available to group admins only.");
    return false;
  }
  return true;
}

export function addOrUpdateMember(state: GroupState, input: { id: number; username?: string; joined?: boolean }): Member {
  const key = String(input.id);
  const existing = state.members[key];
  const member: Member = existing ?? {
    userId: input.id,
    joinTime: now().getTime(),
    verified: false,
    trusted: false,
    messageTimes: [],
  };
  if (input.username) member.username = input.username.toLowerCase();
  state.members[key] = member;
  if (!state.memberIds.includes(input.id)) state.memberIds.push(input.id);
  if (input.joined && !existing) state.joins.push(now().getTime());
  return member;
}

export function targetFromCommand(ctx: Ctx, state: GroupState, raw: string): Member | undefined {
  const replied = ctx.message?.reply_to_message?.from;
  if (replied && !replied.is_bot) return addOrUpdateMember(state, { id: replied.id, username: replied.username });
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  if (!username) return undefined;
  return state.memberIds.map((id) => state.members[String(id)]).find((m) => m?.username === username);
}

export function verificationKeyboard() {
  return inlineKeyboard([[inlineButton("I’m human", "verify:confirm")]]);
}

export function backKeyboard() {
  return inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
}

export function settingsKeyboard() {
  return inlineKeyboard([
    [inlineButton("Verification timeout", "settings:timeout"), inlineButton("Link threshold", "settings:link")],
    [inlineButton("Spam sensitivity", "settings:sensitivity"), inlineButton("Escalation", "settings:escalation")],
    [inlineButton("Welcome message", "settings:welcome"), inlineButton("Rules text", "settings:rules")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

export function compactEvidence(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}
