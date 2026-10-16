// Lightweight client-side persistence layer used by DEMO MODE.
// In production this entire module is replaced by real HTTP calls to the
// C++ / Crow + SQLite backend (see src/lib/api.ts ATTEMPT_REAL_BACKEND flag
// and backend/ for the real implementation). It intentionally mirrors the
// SQLite schema described in database/migrations so swapping it out later
// is a drop-in change.
import type { Transcript, TTSGeneration, User, UserSettings } from "../types";

const KEYS = {
  users: "vta_users",
  session: "vta_session",
  transcripts: "vta_transcripts",
  tts: "vta_tts",
  settings: "vta_settings",
  logs: "vta_activity_logs",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// --- Users ------------------------------------------------------------
export interface StoredUser extends User {
  password_hash: string;
}

export function getUsers(): StoredUser[] {
  return read<StoredUser[]>(KEYS.users, []);
}
export function saveUsers(users: StoredUser[]) {
  write(KEYS.users, users);
}
export function findUserByEmail(email: string): StoredUser | undefined {
  return getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

// --- Session (simulated signed token) ---------------------------------
export function setSession(userId: string | null) {
  if (userId) localStorage.setItem(KEYS.session, userId);
  else localStorage.removeItem(KEYS.session);
}
export function getSession(): string | null {
  return localStorage.getItem(KEYS.session);
}

// --- Transcripts / Documents -------------------------------------------
export function getTranscripts(userId: string): Transcript[] {
  return read<Transcript[]>(KEYS.transcripts, []).filter((t) => t.user_id === userId);
}
export function getAllTranscripts(): Transcript[] {
  return read<Transcript[]>(KEYS.transcripts, []);
}
export function saveTranscript(t: Transcript) {
  const all = read<Transcript[]>(KEYS.transcripts, []);
  const idx = all.findIndex((x) => x.id === t.id);
  if (idx >= 0) all[idx] = t;
  else all.unshift(t);
  write(KEYS.transcripts, all);
}
export function deleteTranscript(id: string) {
  const all = read<Transcript[]>(KEYS.transcripts, []).filter((t) => t.id !== id);
  write(KEYS.transcripts, all);
}

// --- TTS Generations -----------------------------------------------------
export function getTTS(userId: string): TTSGeneration[] {
  return read<TTSGeneration[]>(KEYS.tts, []).filter((t) => t.user_id === userId);
}
export function saveTTSItem(item: TTSGeneration) {
  const all = read<TTSGeneration[]>(KEYS.tts, []);
  const idx = all.findIndex((x) => x.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.unshift(item);
  write(KEYS.tts, all);
}
export function deleteTTSItem(id: string) {
  const all = read<TTSGeneration[]>(KEYS.tts, []).filter((t) => t.id !== id);
  write(KEYS.tts, all);
}
export function toggleTTSFavorite(id: string, favorite: boolean): TTSGeneration | undefined {
  const all = read<TTSGeneration[]>(KEYS.tts, []);
  const idx = all.findIndex((x) => x.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], favorite };
    write(KEYS.tts, all);
    return all[idx];
  }
  return undefined;
}

// --- Settings ------------------------------------------------------------
export const DEFAULT_SETTINGS: UserSettings = {
  theme: "light",
  defaultLanguage: "en",
  defaultVoice: "default-female",
  defaultSpeed: 1,
  autoSave: true,
  audioRetentionDays: 30,
  notifications: true,
  shareWithProviders: false,
};

export function getSettings(userId: string): UserSettings {
  const all = read<Record<string, UserSettings>>(KEYS.settings, {});
  return all[userId] ?? DEFAULT_SETTINGS;
}
export function saveSettings(userId: string, settings: UserSettings) {
  const all = read<Record<string, UserSettings>>(KEYS.settings, {});
  all[userId] = settings;
  write(KEYS.settings, all);
}

// --- Activity log (audit trail) ------------------------------------------
export function logActivity(userId: string, message: string) {
  const all = read<{ id: string; userId: string; message: string; at: string }[]>(KEYS.logs, []);
  all.unshift({ id: uid("log"), userId, message, at: new Date().toISOString() });
  write(KEYS.logs, all.slice(0, 200));
}

export function seedDemoData(userId: string) {
  const existing = getTranscripts(userId);
  if (existing.length) return;
  const now = Date.now();
  const demo: Transcript[] = [
    {
      id: uid("doc"),
      user_id: userId,
      title: "Weekly Standup Notes",
      content:
        "Today we discussed the Q3 roadmap, finalized the voice assistant milestones, and agreed to ship the demo build by Friday. Action items were assigned to each team lead.",
      language: "en",
      type: "voice_to_text",
      duration: 64,
      favorite: true,
      status: "demo",
      created_at: new Date(now - 86400000 * 2).toISOString(),
      updated_at: new Date(now - 86400000 * 2).toISOString(),
    },
    {
      id: uid("doc"),
      user_id: userId,
      title: "Client Call Summary",
      content:
        "Client requested multilingual support for Urdu and Arabic, along with downloadable transcripts in PDF format. Follow-up scheduled next Tuesday.",
      language: "ur",
      type: "ai_summary",
      duration: null,
      favorite: false,
      status: "demo",
      created_at: new Date(now - 86400000).toISOString(),
      updated_at: new Date(now - 86400000).toISOString(),
    },
  ];
  demo.forEach(saveTranscript);

  const existingTts = getTTS(userId);
  if (!existingTts.length) {
    saveTTSItem({
      id: uid("tts"),
      user_id: userId,
      text: "Welcome to VoiceText AI, your professional voice intelligence workspace.",
      language: "en",
      voice: "default-female",
      speed: 1,
      audio_data_url: null,
      favorite: true,
      status: "demo",
      created_at: new Date(now - 86400000 * 3).toISOString(),
    });
  }
}
