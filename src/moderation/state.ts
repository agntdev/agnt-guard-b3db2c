import { persistentStore } from "../toolkit/index.js";

export type Escalation = "warn" | "mute" | "remove";
export type Sensitivity = "low" | "normal" | "high";

export interface Member {
  userId: number;
  username?: string;
  joinTime: number;
  verified: boolean;
  trusted: boolean;
  verificationDeadline?: number;
  messageTimes: number[];
}

export interface Incident {
  timestamp: number;
  actionType: "warn" | "mute" | "remove";
  evidence: string;
  userId: number;
}

export interface AdminAction {
  timestamp: number;
  actionType: "warn" | "mute" | "kick";
  reason: string;
  adminId: number;
  userId: number;
}

export interface GroupSettings {
  verificationTimeoutMinutes: number;
  linkSuspicionHours: number;
  sensitivity: Sensitivity;
  welcome: string;
  rules: string;
  escalation: Escalation;
}

export interface GroupState {
  memberIds: number[];
  members: Record<string, Member>;
  incidents: Incident[];
  adminActions: AdminAction[];
  recentMessages: Array<{ text: string; at: number; userId: number }>;
  joins: number[];
  lastDailySummaryDay?: string;
  lastWeeklySummaryWeek?: string;
  settings: GroupSettings;
}

const defaults: GroupSettings = {
  verificationTimeoutMinutes: 5,
  linkSuspicionHours: 48,
  sensitivity: "normal",
  welcome: "Welcome. Verify that you’re human before posting.",
  rules: "Keep the conversation relevant and avoid spam.",
  escalation: "mute",
};

function fresh(): GroupState {
  return { memberIds: [], members: {}, incidents: [], adminActions: [], recentMessages: [], joins: [], settings: { ...defaults } };
}

const store = persistentStore();
export const storageReady = () => store.available();
export async function readGroup(chatId: number): Promise<GroupState> {
  return (await store.read<GroupState>(`group:${chatId}`)) ?? fresh();
}
export async function writeGroup(chatId: number, state: GroupState): Promise<boolean> {
  // Rotate retained logs to the most recent 500 records; all indexes remain explicit.
  state.incidents = state.incidents.slice(-500);
  state.adminActions = state.adminActions.slice(-500);
  state.recentMessages = state.recentMessages.slice(-100);
  state.joins = state.joins.slice(-500);
  return store.write(`group:${chatId}`, state);
}
export function defaultSettings(): GroupSettings { return { ...defaults }; }
