// Shared domain types for VoiceText AI frontend.
// These mirror the C++ backend models (see backend/include/models/Models.hpp)
// so the demo-mode client and the real REST client share one contract.

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error_code?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type DocumentType = "voice_to_text" | "text_to_voice" | "ai_summary" | "translation";
export type DocumentStatus = "completed" | "processing" | "failed" | "demo";

export interface Transcript {
  id: string;
  user_id: string;
  title: string;
  content: string;
  language: string;
  type: DocumentType;
  source_audio?: string | null;
  duration?: number | null;
  favorite: boolean;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

export interface TTSGeneration {
  id: string;
  user_id: string;
  text: string;
  language: string;
  voice: string;
  speed: number;
  audio_data_url?: string | null;
  audio_path?: string | null;
  audio_url?: string | null;
  favorite: boolean;
  status: DocumentStatus;
  created_at: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  speechCode: string; // BCP-47 code used by Web Speech API
  flag: string;
}

export interface VoiceOption {
  id: string;
  label: string;
  language: string;
  gender: "male" | "female" | "neutral";
}

export interface UserSettings {
  theme: "light" | "dark";
  defaultLanguage: string;
  defaultVoice: string;
  defaultSpeed: number;
  autoSave: boolean;
  audioRetentionDays: number;
  notifications: boolean;
  shareWithProviders: boolean;
}

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
}

export type AIOperation = "summarize" | "grammar" | "translate" | "notes" | "keywords" | "rewrite";
