// Unified API client.
//
// VoiceText AI is designed to talk to the real C++ (Crow + SQLite) backend
// described in /backend via a plain REST contract (see docs/ARCHITECTURE.md).
// When VITE_API_BASE_URL is reachable, every call below is a thin fetch()
// wrapper. When it is not reachable (e.g. this hosted preview, which has no
// C++ runtime), the client transparently falls back to an in-browser DEMO
// MODE that reproduces the exact same {success, message, data} contract using
// localStorage + the Web Speech API. Demo data is always clearly labeled.
import type {
  AIOperation,
  ApiResponse,
  Transcript,
  TTSGeneration,
  User,
  UserSettings,
} from "../types";
import {
  DEFAULT_SETTINGS,
  deleteTranscript,
  deleteTTSItem,
  findUserByEmail,
  getSession,
  getSettings,
  getTranscripts,
  getTTS,
  getUsers,
  logActivity,
  saveSettings,
  saveTranscript,
  saveTTSItem,
  saveUsers,
  seedDemoData,
  setSession,
  toggleTTSFavorite,
  uid,
  type StoredUser,
} from "./storage";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const API_BASE_URL = env?.VITE_API_BASE_URL || "/api";
export let DEMO_MODE = true;
let backendAvailable: boolean | null = null;
let healthCheck: Promise<boolean> | null = null;

function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// naive, dependency-free "password hash" placeholder for the browser demo
// only. The real backend uses bcrypt/argon2 (see backend/include/utils/Security.hpp).
async function hashDemo(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password + "::voicetext-demo-salt");
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ok<T>(data: T, message = "Success"): ApiResponse<T> {
  return { success: true, message, data };
}
function fail<T = never>(message: string, error_code = "ERROR"): ApiResponse<T> {
  return { success: false, message, error_code };
}

function toUser(u: StoredUser): User {
  return { id: u.id, name: u.name, email: u.email, created_at: u.created_at, updated_at: u.updated_at };
}

function setBackendAvailable(available: boolean) {
  backendAvailable = available;
  DEMO_MODE = !available;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("voicetext:backend-mode", { detail: { demo: DEMO_MODE } }));
  }
}

let lastHealthCheck = 0;

export async function isBackendAvailable(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && backendAvailable !== null && (backendAvailable === true ? now - lastHealthCheck < 15000 : now - lastHealthCheck < 3000)) {
    return backendAvailable;
  }
  if (!healthCheck) {
    lastHealthCheck = now;
    healthCheck = fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })
      .then((response) => {
        setBackendAvailable(response.ok);
        return response.ok;
      })
      .catch(() => {
        setBackendAvailable(false);
        return false;
      })
      .finally(() => {
        healthCheck = null;
      });
  }
  return healthCheck;
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
): Promise<ApiResponse<T>> {
  try {
    const token = getSession();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    const result = (await response.json()) as ApiResponse<T>;
    if (!response.ok && result.success !== false) {
      return fail(result.message || `Request failed with status ${response.status}`, result.error_code || "REQUEST_FAILED");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    return fail(`Backend request failed: ${message}`, "NETWORK_ERROR");
  }
}

function backendUserResponse(response: ApiResponse<{ token: string; user: User }>): ApiResponse<User> {
  if (!response.success || !response.data) return (response as unknown) as ApiResponse<User>;
  setSession(response.data.token);
  return { ...response, data: response.data.user };
}

function fromBackendSettings(settings: Record<string, unknown>): UserSettings {
  return {
    theme: settings.theme === "dark" ? "dark" : "light",
    defaultLanguage: String(settings.default_language ?? DEFAULT_SETTINGS.defaultLanguage),
    defaultVoice: String(settings.default_voice ?? DEFAULT_SETTINGS.defaultVoice),
    defaultSpeed: Number(settings.default_speed ?? DEFAULT_SETTINGS.defaultSpeed),
    autoSave: Boolean(settings.auto_save ?? DEFAULT_SETTINGS.autoSave),
    audioRetentionDays: Number(settings.audio_retention_days ?? DEFAULT_SETTINGS.audioRetentionDays),
    notifications: Boolean(settings.notifications ?? DEFAULT_SETTINGS.notifications),
    shareWithProviders: Boolean(settings.share_with_providers ?? DEFAULT_SETTINGS.shareWithProviders),
  };
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
export const authApi = {
  async register(name: string, email: string, password: string): Promise<ApiResponse<User>> {
    if (!name.trim() || !email.trim() || password.length < 6) {
      return delay(fail("Please provide a valid name, email, and a password with 6+ characters", "VALIDATION_ERROR"));
    }
    if (await isBackendAvailable()) {
      return backendUserResponse(
        await request<{ token: string; user: User }>("/auth/register", "POST", { name, email, password }, false),
      );
    }
    if (findUserByEmail(email)) {
      return delay(fail("An account with this email already exists", "EMAIL_TAKEN"));
    }
    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: uid("user"),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: await hashDemo(password),
      created_at: now,
      updated_at: now,
    };
    const users = getUsers();
    users.push(newUser);
    saveUsers(users);
    setSession(newUser.id);
    seedDemoData(newUser.id);
    logActivity(newUser.id, "Account registered");
    return delay(ok(toUser(newUser), "Account created successfully"));
  },

  async login(email: string, password: string): Promise<ApiResponse<User>> {
    if (await isBackendAvailable()) {
      return backendUserResponse(await request<{ token: string; user: User }>("/auth/login", "POST", { email, password }, false));
    }
    const user = findUserByEmail(email);
    if (!user) return delay(fail("Invalid email or password", "AUTH_FAILED"));
    const hashed = await hashDemo(password);
    if (hashed !== user.password_hash) return delay(fail("Invalid email or password", "AUTH_FAILED"));
    setSession(user.id);
    seedDemoData(user.id);
    logActivity(user.id, "User logged in");
    return delay(ok(toUser(user), "Welcome back!"));
  },

  async logout(): Promise<ApiResponse<null>> {
    const userId = getSession();
    const result = (await isBackendAvailable()) ? await request<null>("/auth/logout", "POST") : ok(null, "Logged out");
    if (userId) logActivity(userId, "User logged out");
    setSession(null);
    return result;
  },

  async me(): Promise<ApiResponse<User>> {
    if (await isBackendAvailable()) {
      const response = await request<User>("/auth/me");
      if (!response.success && response.error_code === "NO_SESSION") setSession(null);
      return response;
    }
    const id = getSession();
    if (!id) return delay(fail("Session expired. Please log in again.", "NO_SESSION"), 150);
    const user = getUsers().find((u) => u.id === id);
    if (!user) return delay(fail("Session expired. Please log in again.", "NO_SESSION"), 150);
    return delay(ok(toUser(user)), 150);
  },

  async updateProfile(name: string): Promise<ApiResponse<User>> {
    if (await isBackendAvailable()) return request("/user/profile", "PUT", { name });
    const id = getSession();
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return delay(fail("Session expired", "NO_SESSION"));
    users[idx] = { ...users[idx], name, updated_at: new Date().toISOString() };
    saveUsers(users);
    return delay(ok(toUser(users[idx]), "Profile updated"));
  },

  async changePassword(current: string, next: string): Promise<ApiResponse<null>> {
    if (await isBackendAvailable()) return request("/user/password", "POST", { current_password: current, new_password: next });
    const id = getSession();
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return delay(fail("Session expired", "NO_SESSION"));
    const hashed = await hashDemo(current);
    if (hashed !== users[idx].password_hash) return delay(fail("Current password is incorrect", "AUTH_FAILED"));
    users[idx].password_hash = await hashDemo(next);
    users[idx].updated_at = new Date().toISOString();
    saveUsers(users);
    return delay(ok(null, "Password updated successfully"));
  },

  async deleteAccount(): Promise<ApiResponse<null>> {
    if (await isBackendAvailable()) {
      const response = await request<null>("/user/account", "DELETE");
      if (response.success) setSession(null);
      return response;
    }
    const id = getSession();
    const users = getUsers().filter((u) => u.id !== id);
    saveUsers(users);
    setSession(null);
    return delay(ok(null, "Account deleted"));
  },
};

// ---------------------------------------------------------------------------
// TRANSCRIPTS (voice-to-text documents, AI outputs, translations)
// ---------------------------------------------------------------------------
export const transcriptApi = {
  async list(userId: string): Promise<ApiResponse<Transcript[]>> {
    if (await isBackendAvailable()) return request(`/transcripts?page=1&page_size=100`);
    return delay(ok(getTranscripts(userId)), 250);
  },
  async create(payload: Omit<Transcript, "id" | "created_at" | "updated_at">): Promise<ApiResponse<Transcript>> {
    if (await isBackendAvailable()) return request("/transcripts", "POST", payload);
    const now = new Date().toISOString();
    const transcript: Transcript = { ...payload, id: uid("doc"), created_at: now, updated_at: now };
    saveTranscript(transcript);
    logActivity(payload.user_id, `Created document "${payload.title}"`);
    return delay(ok(transcript, "Document saved"));
  },
  async update(id: string, patch: Partial<Transcript>): Promise<ApiResponse<Transcript | null>> {
    if (await isBackendAvailable()) return request(`/transcripts/${encodeURIComponent(id)}`, "PUT", patch);
    const all = getTranscripts(patch.user_id || "");
    const existing =
      all.find((t) => t.id === id) ||
      getTranscripts(getSession() || "").find((t) => t.id === id);
    if (!existing) return delay(fail("Document not found", "NOT_FOUND"));
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    saveTranscript(updated);
    return delay(ok(updated, "Document updated"));
  },
  async remove(id: string): Promise<ApiResponse<null>> {
    if (await isBackendAvailable()) return request(`/transcripts/${encodeURIComponent(id)}`, "DELETE");
    deleteTranscript(id);
    return delay(ok(null, "Document deleted"));
  },
};

// ---------------------------------------------------------------------------
// STT (the actual recognition happens client-side via Web Speech API;
// this call represents the backend "finalize + persist" step)
// ---------------------------------------------------------------------------
export const sttApi = {
  async saveTranscription(userId: string, content: string, language: string, duration: number, title?: string): Promise<ApiResponse<Transcript>> {
    const finalTitle = title || `Voice Note — ${new Date().toLocaleString()}`;
    if (await isBackendAvailable()) {
      return request<Transcript>("/stt/transcribe", "POST", {
        content,
        language,
        duration,
        title: finalTitle,
      });
    }
    return transcriptApi.create({
      user_id: userId,
      title: finalTitle,
      content,
      language,
      type: "voice_to_text",
      source_audio: null,
      duration,
      favorite: false,
      status: "demo",
    });
  },

  async upload(file: File, language: string): Promise<ApiResponse<Transcript>> {
    if (!(await isBackendAvailable())) {
      return fail("Audio upload requires the C++ backend to be available.", "BACKEND_UNAVAILABLE");
    }
    const form = new FormData();
    form.append("audio", file);
    form.append("language", language);
    return request("/stt/upload", "POST", form);
  },
};

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------
export const ttsApi = {
  async list(userId: string): Promise<ApiResponse<TTSGeneration[]>> {
    if (await isBackendAvailable()) return request("/tts");
    return delay(ok(getTTS(userId)), 200);
  },
  async generate(userId: string, text: string, language: string, voice: string, speed: number): Promise<ApiResponse<TTSGeneration>> {
    if (!text.trim()) return delay(fail("Text cannot be empty", "VALIDATION_ERROR"));
    if (text.length > 5000) return delay(fail("Text exceeds the 5000 character limit", "VALIDATION_ERROR"));
    if (await isBackendAvailable()) return request("/tts/generate", "POST", { text, language, voice, speed });
    const item: TTSGeneration = {
      id: uid("tts"),
      user_id: userId,
      text,
      language,
      voice,
      speed,
      audio_data_url: null,
      favorite: false,
      status: "demo",
      created_at: new Date().toISOString(),
    };
    saveTTSItem(item);
    logActivity(userId, "Generated text-to-speech audio");
    return delay(ok(item, "Speech generated"), 700);
  },
  async remove(id: string): Promise<ApiResponse<null>> {
    if (await isBackendAvailable()) return request(`/tts/${encodeURIComponent(id)}`, "DELETE");
    deleteTTSItem(id);
    return delay(ok(null, "Audio deleted"));
  },
  async toggleFavorite(id: string, favorite: boolean): Promise<ApiResponse<TTSGeneration | null>> {
    if (await isBackendAvailable()) {
      return request(`/tts/${encodeURIComponent(id)}/favorite`, "PUT", { favorite });
    }
    const updated = toggleTTSFavorite(id, favorite);
    if (!updated) return delay(fail("Audio item not found", "NOT_FOUND"));
    return delay(ok(updated, favorite ? "Saved to favorites" : "Removed from favorites"));
  },
};

// ---------------------------------------------------------------------------
// AI TEXT PROCESSING (demo heuristics — real backend would call
// backend/include/providers/AITextService.hpp implementations)
// ---------------------------------------------------------------------------
function summarize(text: string): string {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length <= 2) return text.trim();
  const keep = Math.max(1, Math.ceil(sentences.length * 0.4));
  return sentences.slice(0, keep).join(" ");
}
function correctGrammar(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bi\b/g, "I")
    .replace(/([.?!])([a-zA-Z])/g, "$1 $2")
    .replace(/\s+([,.!?])/g, "$1")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
function extractKeywords(text: string): string {
  const stop = new Set(["the", "a", "an", "is", "are", "was", "were", "and", "or", "to", "of", "in", "on", "for", "with", "that", "this", "it", "as", "we", "i", "be"]);
  const freq = new Map<string, number>();
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => `#${w}`)
    .join("  ");
}
function generateNotes(text: string): string {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/).filter(Boolean);
  return sentences.map((s) => `• ${s.trim()}`).join("\n");
}
function rewrite(text: string): string {
  return text
    .replace(/\bvery\b/gi, "extremely")
    .replace(/\bgood\b/gi, "excellent")
    .replace(/\bbad\b/gi, "poor")
    .replace(/\bimportant\b/gi, "critical");
}
const TRANSLATION_PREFIX: Record<string, string> = {
  en: "", ur: "[اردو ترجمہ] ", hi: "[हिंदी अनुवाद] ", ps: "[پښتو ژباړه] ", ar: "[ترجمة عربية] ",
};
function translate(text: string, targetLang: string): string {
  return `${TRANSLATION_PREFIX[targetLang] ?? `[${targetLang}] `}${text}`;
}

export const aiApi = {
  async process(text: string, operation: AIOperation, targetLang = "en"): Promise<ApiResponse<{ result: string; operation: AIOperation }>> {
    if (!text.trim()) return delay(fail("No text supplied for AI processing", "VALIDATION_ERROR"));
    if (await isBackendAvailable()) {
      return request(`/ai/${operation}`, "POST", { text, target_language: targetLang });
    }
    let result = text;
    switch (operation) {
      case "summarize": result = summarize(text); break;
      case "grammar": result = correctGrammar(text); break;
      case "keywords": result = extractKeywords(text); break;
      case "notes": result = generateNotes(text); break;
      case "rewrite": result = rewrite(text); break;
      case "translate": result = translate(text, targetLang); break;
    }
    return delay(ok({ result, operation }, "AI processing complete (demo engine)"), 900);
  },
};

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
export const settingsApi = {
  async get(userId: string): Promise<ApiResponse<UserSettings>> {
    const local = getSettings(userId || "guest") || DEFAULT_SETTINGS;
    if (await isBackendAvailable()) {
      try {
        const response = await request<Record<string, unknown>>("/user/settings");
        if (response.success && response.data) {
          const parsed = fromBackendSettings(response.data);
          saveSettings(userId || "guest", parsed);
          return { ...response, data: parsed };
        }
      } catch {
        // Fall back to local settings
      }
    }
    return delay(ok(local), 50);
  },
  async update(userId: string, settings: UserSettings): Promise<ApiResponse<UserSettings>> {
    saveSettings(userId || "guest", settings);
    if (await isBackendAvailable()) {
      try {
        const response = await request<Record<string, unknown>>("/user/settings", "PUT", {
          theme: settings.theme,
          default_language: settings.defaultLanguage,
          default_voice: settings.defaultVoice,
          default_speed: settings.defaultSpeed,
          auto_save: settings.autoSave,
          audio_retention_days: settings.audioRetentionDays,
          notifications: settings.notifications,
          share_with_providers: settings.shareWithProviders,
        });
        if (response.success && response.data) {
          return { ...response, data: fromBackendSettings(response.data) };
        }
      } catch {
        // Fall back to local
      }
    }
    return delay(ok(settings, "Settings saved successfully"), 50);
  },
};

export const healthApi = {
  async check(): Promise<ApiResponse<{ mode: string; backend: string }>> {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(900) });
      if (res.ok) {
        const json = await res.json();
        setBackendAvailable(true);
        return { success: true, message: "Connected to live backend", data: { mode: "live", backend: JSON.stringify(json) } };
      }
    } catch {
      setBackendAvailable(false);
    }
    if (backendAvailable !== false) setBackendAvailable(false);
    return ok({ mode: "demo", backend: "none" }, "Running in demo mode (no C++ backend reachable)");
  },
};
