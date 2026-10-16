import type { LanguageOption, VoiceOption } from "../types";

// Configurable language registry. New languages can be appended here without
// touching any other part of the application (see backend config/settings.json
// for the server-side equivalent of this table).
export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", speechCode: "en-US", flag: "🇺🇸" },
  { code: "ur", label: "Urdu", speechCode: "ur-PK", flag: "🇵🇰" },
  { code: "hi", label: "Hindi", speechCode: "hi-IN", flag: "🇮🇳" },
  { code: "ps", label: "Pashto", speechCode: "ps-AF", flag: "🇦🇫" },
  { code: "ar", label: "Arabic", speechCode: "ar-SA", flag: "🇸🇦" },
];

export const VOICES: VoiceOption[] = [
  { id: "default-female", label: "Aria (Female)", language: "en", gender: "female" },
  { id: "default-male", label: "Guy (Male)", language: "en", gender: "male" },
  { id: "neutral-1", label: "Nova (Neutral)", language: "en", gender: "neutral" },
  { id: "ur-female", label: "Uzma (Female - Neural)", language: "ur", gender: "female" },
  { id: "ur-male", label: "Asad (Male - Neural)", language: "ur", gender: "male" },
  { id: "hi-female", label: "Swara (Female - Neural)", language: "hi", gender: "female" },
  { id: "hi-male", label: "Madhur (Male - Neural)", language: "hi", gender: "male" },
  { id: "ps-female", label: "Latifa (Female - Neural)", language: "ps", gender: "female" },
  { id: "ps-male", label: "Gul Nawaz (Male - Neural)", language: "ps", gender: "male" },
  { id: "ar-female", label: "Zariyah (Female - Neural)", language: "ar", gender: "female" },
  { id: "ar-male", label: "Hamed (Male - Neural)", language: "ar", gender: "male" },
];

export function getLanguage(code: string): LanguageOption {
  const norm = (code || "").toLowerCase().split("-")[0];
  return LANGUAGES.find((l) => l.code === code || l.code === norm) ?? LANGUAGES[0];
}

export function voicesForLanguage(code: string): VoiceOption[] {
  const norm = (code || "").toLowerCase().split("-")[0];
  const matches = VOICES.filter((v) => v.language === code || v.language === norm);
  return matches.length ? matches : VOICES.filter((v) => v.language === "en");
}
