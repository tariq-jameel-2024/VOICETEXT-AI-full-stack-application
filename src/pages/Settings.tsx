import { useEffect, useRef, useState, useMemo } from "react";
import {
  Save,
  Moon,
  Sun,
  ShieldCheck,
  Bell,
  Database,
  Languages as LangIcon,
  Volume2,
  Square,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Radio,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Button, Select, Badge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { settingsApi, ttsApi, isBackendAvailable } from "../lib/api";
import { DEFAULT_SETTINGS, getTranscripts, getTTS, saveSettings } from "../lib/storage";
import type { UserSettings } from "../types";
import { LANGUAGES, VOICES, voicesForLanguage } from "../lib/languages";
import { speak, cancelSpeech } from "../lib/speech";

const SAMPLE_TEXTS: Record<string, string> = {
  ur: "یہ وائس ٹیکسٹ اے آئی کی نیچرل اردو آواز ہے۔ آپ کی آواز کا بہترین معاون۔",
  en: "Hello! This is a preview of your default VoiceText AI natural speech voice.",
  hi: "नमस्ते! यह वॉइस टेक्स्ट एआई की प्राकृतिक हिंदी आवाज़ है।",
  ps: "سلام! دا وائس ټیکسټ ای آی خوندور او روان غږ دی.",
  ar: "مرحبا بك في فويس تيكست، المساعد الذكي لتحويل الصوت والنصوص.",
};

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { push } = useToast();

  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...DEFAULT_SETTINGS,
    theme: theme,
  }));
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(new Date());
  const [testingVoice, setTestingVoice] = useState(false);
  const [storageStats, setStorageStats] = useState({ transcripts: 0, ttsAudio: 0 });
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  // Load saved settings on mount or user change
  useEffect(() => {
    const userId = user?.id || "guest";
    settingsApi.get(userId).then((res) => {
      if (res.data) {
        setSettings({ ...res.data, theme });
      }
    });

    const userTranscripts = getTranscripts(userId);
    const userTts = getTTS(userId);
    setStorageStats({ transcripts: userTranscripts.length, ttsAudio: userTts.length });
  }, [user, theme]);

  // Keep theme in sync with context
  useEffect(() => {
    if (settings.theme !== theme) {
      setSettings((s) => ({ ...s, theme }));
    }
  }, [theme]);

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      cancelSpeech();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Live Auto-Save handler
  const scheduleAutoSave = (updated: UserSettings) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaving(true);
    autoSaveTimerRef.current = window.setTimeout(async () => {
      const userId = user?.id || "guest";
      saveSettings(userId, updated);
      await settingsApi.update(userId, updated);
      setSaving(false);
      setLastSaved(new Date());
    }, 600);
  };

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };

      // If user changes language, smartly suggest default voice for that language
      if (key === "defaultLanguage") {
        const matchingVoices = voicesForLanguage(value as string);
        if (matchingVoices.length > 0) {
          updated.defaultVoice = matchingVoices[0].id;
        }
      }

      scheduleAutoSave(updated);
      return updated;
    });
  }

  // Instant Theme Switch
  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    update("theme", newTheme);
  };

  // Explicit Save button
  async function handleManualSave() {
    const userId = user?.id || "guest";
    setSaving(true);
    setTheme(settings.theme);
    const res = await settingsApi.update(userId, settings);
    setSaving(false);
    setLastSaved(new Date());
    if (res.success) {
      push("Settings saved successfully!", "success");
    } else {
      push(res.message || "Failed to save settings", "error");
    }
  }

  // Reset to default settings
  const handleResetDefaults = () => {
    const defaults = { ...DEFAULT_SETTINGS, theme };
    setSettings(defaults);
    scheduleAutoSave(defaults);
    push("Settings reset to defaults", "info");
  };

  // Live Voice Preview Tester
  const handleTestVoice = async () => {
    if (testingVoice) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      cancelSpeech();
      setTestingVoice(false);
      return;
    }

    setTestingVoice(true);
    const selectedVoice = VOICES.find((v) => v.id === settings.defaultVoice) || VOICES[0];
    const voiceLang = selectedVoice.language || settings.defaultLanguage || "en";
    const sampleText = SAMPLE_TEXTS[voiceLang] || SAMPLE_TEXTS.en;

    try {
      if (await isBackendAvailable()) {
        const res = await ttsApi.generate(
          user?.id || "guest",
          sampleText,
          voiceLang,
          selectedVoice.id,
          settings.defaultSpeed
        );

        if (res.success && res.data?.audio_path) {
          const audioUrl = `http://localhost:8080/api/audio/${res.data.audio_path}`;
          const audio = new Audio(audioUrl);
          audioPreviewRef.current = audio;
          audio.playbackRate = settings.defaultSpeed || 1.0;
          audio.onended = () => setTestingVoice(false);
          audio.onerror = () => {
            speak(sampleText, {
              lang: voiceLang,
              rate: settings.defaultSpeed,
              onEnd: () => setTestingVoice(false),
            });
          };
          await audio.play();
          return;
        }
      }

      // Fallback in-browser speech synthesis
      speak(sampleText, {
        lang: voiceLang,
        rate: settings.defaultSpeed,
        onEnd: () => setTestingVoice(false),
      });
    } catch {
      setTestingVoice(false);
    }
  };

  // Browser Notification Tester
  const handleTestNotification = async () => {
    if (!("Notification" in window)) {
      push("Browser notifications are not supported in this browser.", "warning");
      return;
    }

    let perm = Notification.permission;
    if (perm !== "granted") {
      perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }

    if (perm === "granted") {
      new Notification("VoiceText AI", {
        body: "Test Notification: Alerts and background audio processing alerts are active!",
        icon: "/favicon.ico",
      });
      push("Notification triggered! Check your desktop alert center.", "success");
    } else {
      push("Notification permission was denied in your browser settings.", "warning");
    }
  };

  // Purge / Clean Cache
  const handleCleanStorage = () => {
    const userId = user?.id || "guest";
    const currentTranscripts = getTranscripts(userId);
    const currentTts = getTTS(userId);
    setStorageStats({ transcripts: currentTranscripts.length, ttsAudio: currentTts.length });
    push(`Storage optimized! ${currentTranscripts.length} documents & ${currentTts.length} voice generations safe.`, "success");
  };

  const currentVoiceObj = useMemo(
    () => VOICES.find((v) => v.id === settings.defaultVoice),
    [settings.defaultVoice]
  );

  return (
    <Layout title="Settings">
      {/* Top sticky status & action bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Workspace Preferences</h2>
            <div className="flex items-center gap-2 text-xs">
              {saving ? (
                <span className="flex items-center gap-1.5 font-medium text-amber-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving changes…
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Auto-saved {lastSaved ? `at ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleResetDefaults} icon={<RotateCcw className="h-3.5 w-3.5" />}>
            Defaults
          </Button>
          <Button size="sm" onClick={handleManualSave} disabled={saving} icon={<Save className="h-3.5 w-3.5" />}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: Appearance & Language */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Sun className="h-4 w-4 text-indigo-500" /> Appearance &amp; Language
            </h3>
            <Badge tone="indigo">Live Sync</Badge>
          </div>

          <div className="space-y-5">
            {/* Theme Toggle */}
            <Field label="Theme">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleThemeChange("light")}
                  className={`flex items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                    theme === "light"
                      ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-700 shadow-sm shadow-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <Sun className={`h-4.5 w-4.5 ${theme === "light" ? "text-indigo-600 dark:text-indigo-300" : ""}`} />
                  <span>Light Mode</span>
                  {theme === "light" && <Check className="ml-auto h-4 w-4 text-indigo-600 dark:text-indigo-300" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange("dark")}
                  className={`flex items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                    theme === "dark"
                      ? "border-indigo-500 bg-indigo-600/10 font-semibold text-indigo-400 shadow-sm shadow-indigo-950/50"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <Moon className={`h-4.5 w-4.5 ${theme === "dark" ? "text-indigo-400" : ""}`} />
                  <span>Dark Mode</span>
                  {theme === "dark" && <Check className="ml-auto h-4 w-4 text-indigo-400" />}
                </button>
              </div>
            </Field>

            {/* Default Interface Language */}
            <Field label="Default interface language">
              <Select
                value={settings.defaultLanguage}
                onChange={(e) => update("defaultLanguage", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.label} ({l.code.toUpperCase()})
                  </option>
                ))}
              </Select>
            </Field>

            {/* Default TTS Voice */}
            <Field label="Default TTS voice">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <Select
                    value={settings.defaultVoice}
                    onChange={(e) => update("defaultVoice", e.target.value)}
                  >
                    {VOICES.map((v) => {
                      const langMeta = LANGUAGES.find((l) => l.code === v.language);
                      return (
                        <option key={v.id} value={v.id}>
                          {langMeta?.flag} [{langMeta?.label || v.language}] {v.label}
                        </option>
                      );
                    })}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant={testingVoice ? "danger" : "secondary"}
                  size="md"
                  onClick={handleTestVoice}
                  icon={testingVoice ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  className="shrink-0"
                >
                  {testingVoice ? "Stop" : "Test Voice"}
                </Button>
              </div>
              {currentVoiceObj && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Radio className="h-3 w-3 text-indigo-500" />
                  Selected: <span className="font-medium text-slate-700 dark:text-slate-200">{currentVoiceObj.label}</span>
                  {testingVoice && <span className="animate-pulse text-indigo-500 font-semibold">• Playing voice preview…</span>}
                </p>
              )}
            </Field>

            {/* Default Speech Speed */}
            <Field label={`Default speech speed: ${settings.defaultSpeed.toFixed(1)}x`}>
              <div className="space-y-2">
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={settings.defaultSpeed}
                  onChange={(e) => update("defaultSpeed", parseFloat(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600 dark:bg-slate-700"
                />
                <div className="flex justify-between gap-1.5">
                  {[0.8, 1.0, 1.2, 1.5].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => update("defaultSpeed", spd)}
                      className={`flex-1 rounded-lg border py-1 text-xs font-medium transition ${
                        Math.abs(settings.defaultSpeed - spd) < 0.05
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                          : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      {spd === 1.0 ? "1.0x Normal" : `${spd}x`}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
        </Card>

        {/* Card 2: Documents & Storage */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Database className="h-4 w-4 text-emerald-500" /> Documents &amp; Storage
            </h3>
            <Badge tone="green">Local SQLite / Edge</Badge>
          </div>

          <div className="space-y-5">
            <ToggleRow
              label="Auto-save transcripts"
              description="Automatically saves voice notes and transcript changes to your library as you speak or edit."
              checked={settings.autoSave}
              onChange={(v) => update("autoSave", v)}
            />

            <Field label={`Audio retention period: ${settings.audioRetentionDays} days`}>
              <input
                type="range"
                min={1}
                max={90}
                value={settings.audioRetentionDays}
                onChange={(e) => update("audioRetentionDays", parseInt(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600 dark:bg-slate-700"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Audio recordings older than this are automatically pruned. Text transcripts remain saved indefinitely.
              </p>
            </Field>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Storage Overview</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">{storageStats.transcripts}</span> Saved Transcripts •{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">{storageStats.ttsAudio}</span> Synthesized Voices
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleCleanStorage} icon={<Trash2 className="h-3.5 w-3.5" />}>
                  Optimize
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 3: Notifications */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <Bell className="h-4 w-4 text-amber-500" /> Notifications &amp; Alerts
            </h3>
            <Badge tone={settings.notifications ? "green" : "slate"}>
              {settings.notifications ? "Enabled" : "Muted"}
            </Badge>
          </div>

          <div className="space-y-4">
            <ToggleRow
              label="Enable in-app & desktop notifications"
              description="Get notified when long audio transcriptions, AI summaries, or batch TTS exports complete."
              checked={settings.notifications}
              onChange={(v) => update("notifications", v)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span>Browser Permission: </span>
                <span className={`font-semibold ${notifPermission === "granted" ? "text-emerald-500" : "text-amber-500"}`}>
                  {notifPermission.toUpperCase()}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={handleTestNotification} icon={<Bell className="h-3.5 w-3.5" />}>
                Send Test Alert
              </Button>
            </div>
          </div>
        </Card>

        {/* Card 4: Privacy & Engine Mode */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Privacy &amp; AI Providers
            </h3>
            <Badge tone={settings.shareWithProviders ? "amber" : "green"}>
              {settings.shareWithProviders ? "External Cloud Enabled" : "Edge / Local Engine"}
            </Badge>
          </div>

          <div className="space-y-4">
            <ToggleRow
              label="Allow sharing with external AI/STT/TTS providers"
              description="When enabled, text or audio can use external cloud services configured on the backend. When disabled, only local Edge-TTS and on-device engines are utilized."
              checked={settings.shareWithProviders}
              onChange={(v) => update("shareWithProviders", v)}
            />

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <p className="flex items-start gap-2">
                <LangIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                <span>
                  Your privacy is fully protected. Voice recordings, transcripts, and model outputs are stored directly in your local environment.
                </span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Save Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/60 pt-6 dark:border-slate-800/60">
        <p className="text-xs text-slate-400">
          All settings persist across browser sessions and synchronize automatically with the VoiceText engine.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleResetDefaults} icon={<RotateCcw className="h-4 w-4" />}>
            Reset Defaults
          </Button>
          <Button onClick={handleManualSave} disabled={saving} icon={<Save className="h-4 w-4" />}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="cursor-pointer" onClick={() => onChange(!checked)}>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
          checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
